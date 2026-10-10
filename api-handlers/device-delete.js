import { migrate, getDb } from '../lib/db.js';
import { getSessionUser } from '../lib/auth.js';

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const body = typeof req.body === 'string' ? {} : req.body || {};
  return body.token || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    await migrate();
    const user = await getSessionUser(getToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = Number(body.id || body.deviceId);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'id обязателен' });
    }

    const db = getDb();
    const row = await db.execute({
      sql: `SELECT d.id, d.subscription_id FROM devices d
            WHERE d.id = ? AND d.user_id = ?`,
      args: [id, user.id]
    });
    if (!row.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Устройство не найдено' });
    }

    await db.execute({
      sql: `DELETE FROM devices WHERE id = ? AND user_id = ?`,
      args: [id, user.id]
    });

    const cnt = await db.execute({
      sql: `SELECT COUNT(*) as c FROM devices WHERE subscription_id = ?`,
      args: [row.rows[0].subscription_id]
    });

    return res.status(200).json({
      ok: true,
      deviceCount: Number(cnt.rows[0]?.c || 0)
    });
  } catch (e) {
    console.error('device delete', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
