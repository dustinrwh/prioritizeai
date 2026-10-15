import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { authRoutes, requireUser, sessionKey } from './auth.js';
import { settingsRoutes } from './routes/settings.js';
import { submissionRoutes } from './routes/submissions.js';

export async function buildApp() {
  const prod = process.env.NODE_ENV === 'production';
  const secret = process.env.SESSION_SECRET;
  if (!secret || (prod && secret.length < 32)) throw new Error('SESSION_SECRET must be set (32+ chars in production)');

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });
  await app.register(cookie);
  await app.register(secureSession, {
    key: sessionKey(secret),
    cookieName: 'session',
    cookie: { path: '/', httpOnly: true, secure: prod, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 },
  });

  app.get('/healthz', async () => ({ ok: true }));

  await app.register(async (api) => {
    await authRoutes(api);
    await api.register(async (priv) => {
      priv.addHook('preHandler', requireUser);
      priv.get('/api/me', async (req) => ({ id: req.user.id, email: req.user.email, name: req.user.name, avatar_url: req.user.avatarUrl, role: req.user.role }));
      await submissionRoutes(priv);
      await settingsRoutes(priv);
    });
  });

  app.setErrorHandler((err: { statusCode?: number; message: string }, req, reply) => {
    req.log.error(err);
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? 'Internal server error' : err.message });
  });

  // Compiled frontend (same container, same origin). SPA fallback for client routes.
  const webDist = resolve(process.env.WEB_DIST ?? '../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
