import { createHash } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { col, nowTs, type AuthedUser, type UserDoc } from './firestore.js';
import { getSettings } from './settings.js';
import { userDTO } from './serialize.js';

declare module '@fastify/secure-session' {
  interface SessionData { userId: string }
}
declare module 'fastify' {
  interface FastifyRequest { user: AuthedUser }
}

export const sessionKey = (secret: string) => createHash('sha256').update(secret).digest();

/** One user per Google account. New users get a deterministic id, so two simultaneous first sign-ins cannot create duplicates. */
export async function upsertUser(p: { sub: string; email: string; name: string; picture?: string | null }): Promise<AuthedUser> {
  const found = await col.users.where('google_sub', '==', p.sub).limit(1).get();
  const fields = { email: p.email, name: p.name, avatar_url: p.picture ?? null };
  if (!found.empty) {
    const doc = found.docs[0]!;
    await doc.ref.update(fields);
    return { ...(doc.data() as UserDoc), ...fields, id: doc.id };
  }
  const id = `g-${createHash('sha256').update(p.sub).digest('hex').slice(0, 32)}`;
  const created: UserDoc = { google_sub: p.sub, ...fields, role: 'member', created_at: nowTs() };
  try {
    await col.users.doc(id).create(created);
    return { ...created, id };
  } catch {
    const again = await col.users.doc(id).get();
    if (!again.exists) throw new Error('Could not create user');
    await again.ref.update(fields);
    return { ...(again.data() as UserDoc), ...fields, id };
  }
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const id = req.session.get('userId');
  const snap = id ? await col.users.doc(id).get() : null;
  if (!snap?.exists) {
    req.session.delete();
    return reply.code(401).send({ error: 'Not signed in' });
  }
  req.user = { ...(snap.data() as UserDoc), id: snap.id };
}

export async function authRoutes(app: FastifyInstance) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const google = new OAuth2Client(clientId);

  app.get('/api/auth/config', async () => ({ google_client_id: clientId ?? null, dev_auth: process.env.DEV_AUTH === '1' }));

  app.post('/api/auth/google', async (req, reply) => {
    const credential = (req.body as { credential?: string } | undefined)?.credential;
    if (!credential || !clientId) return reply.code(400).send({ error: 'Google sign-in is not configured' });
    let payload;
    try {
      const ticket = await google.verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      return reply.code(401).send({ error: 'Invalid Google token' });
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) return reply.code(401).send({ error: 'Unverified Google account' });
    const { allowed_domain } = await getSettings();
    if (allowed_domain && payload.hd?.toLowerCase() !== allowed_domain) {
      return reply.code(403).send({ error: `Sign-in is limited to ${allowed_domain} accounts` });
    }
    const u = await upsertUser({ sub: payload.sub, email: payload.email, name: payload.name ?? payload.email, picture: payload.picture });
    req.session.set('userId', u.id);
    return userDTO(u);
  });

  // Local development only. Never registered unless DEV_AUTH=1 and not production.
  if (process.env.DEV_AUTH === '1' && process.env.NODE_ENV !== 'production') {
    app.post('/api/auth/dev', async (req, reply) => {
      const { email, name } = (req.body ?? {}) as { email?: string; name?: string };
      if (!email) return reply.code(400).send({ error: 'email required' });
      const u = await upsertUser({ sub: `dev:${email}`, email, name: name || email.split('@')[0]! });
      req.session.set('userId', u.id);
      return userDTO(u);
    });
  }

  app.post('/api/auth/logout', async (req) => {
    req.session.delete();
    return { ok: true };
  });
}
