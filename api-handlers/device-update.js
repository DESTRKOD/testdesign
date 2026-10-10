import { migrate, getDb } from '../lib/db.js';
import { getSessionUser } from '../lib/auth.js';

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const body = typeof req.body === 'string' ? {} : req.body || {};
  return body.token || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    await migrate();
    const user = await getSessionUser(getToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = Number(body.id || body.deviceId);
    const name = String(body.name || '').trim().slice(0, 64);
    if (!id || !name) {
      return res.status(400).json({ ok: false, error: 'id и name обязательны' });
    }

    const db = getDb();
    const row = await db.execute({
      sql: `SELECT d.id FROM devices d
            JOIN subscriptions s ON s.id = d.subscription_id
            WHERE d.id = ? AND d.user_id = ?`,
      args: [id, user.id]
    });
    if (!row.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Устройство не найдено' });
    }

    await db.execute({
      sql: `UPDATE devices SET name = ? WHERE id = ?`,
      args: [name, id]
    });

    return res.status(200).json({ ok: true, id, name });
  } catch (e) {
    console.error('device update', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
