import { settingsPatchSchema } from '@prioritize/shared';
import type { FastifyInstance } from 'fastify';
import { getSettings, updateSettings } from '../settings.js';
import { zodFields } from './submissions.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => getSettings());
  app.patch('/api/settings', async (req, reply) => {
    const parsed = settingsPatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', fields: zodFields(parsed.error) });
    req.log.info({ user: req.user.email, patch: parsed.data }, 'settings changed');
    return updateSettings(parsed.data, req.user.id);
  });
}
