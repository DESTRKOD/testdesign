import { migrate, getDb } from '../lib/db.js';
import { getSessionUser } from '../lib/auth.js';

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const body = typeof req.body === 'string' ? {} : req.body || {};
  return body.token || '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    await migrate();
    const user = await getSessionUser(getToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const db = getDb();
    const sub = await db.execute({
      sql: `SELECT id FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      args: [user.id]
    });
    if (!sub.rows[0]) {
      return res.status(200).json({ ok: true, devices: [], deviceLimit: 0 });
    }

    const subRow = await db.execute({
      sql: `SELECT device_limit FROM subscriptions WHERE id = ?`,
      args: [sub.rows[0].id]
    });

    const devices = await db.execute({
      sql: `SELECT id, name, added_at, user_agent FROM devices
            WHERE subscription_id = ? ORDER BY id ASC`,
      args: [sub.rows[0].id]
    });

    return res.status(200).json({
      ok: true,
      devices: devices.rows.map((d, i) => ({
        id: d.id,
        name: d.name || `Устройство ${i + 1}`,
        addedAt: d.added_at,
        userAgent: d.user_agent
      })),
      deviceLimit: Number(subRow.rows[0]?.device_limit || 0)
    });
  } catch (e) {
    console.error('device list', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
