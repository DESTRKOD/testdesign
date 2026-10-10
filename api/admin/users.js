import { migrate, getDb } from '../../lib/db.js';
import { requireAdmin } from '../../lib/adminAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    await migrate();
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return res.status(gate.status || 403).json({ ok: false, error: gate.error });
    }

    const db = getDb();
    const q =
      typeof req.body === 'object' && req.body?.q
        ? String(req.body.q)
        : String(req.query?.q || '');

    let result;
    if (q) {
      const like = '%' + q + '%';
      result = await db.execute({
        sql: `SELECT u.id, u.phone, u.tg_id, u.name, u.created_at,
              s.id as sub_id, s.display_name, s.status as sub_status, s.device_limit
              FROM users u
              LEFT JOIN subscriptions s ON s.user_id = u.id
              WHERE u.phone LIKE ? OR u.name LIKE ? OR CAST(u.id AS TEXT) = ? OR CAST(u.tg_id AS TEXT) = ?
              ORDER BY u.id DESC LIMIT 50`,
        args: [like, like, q, q]
      });
    } else {
      result = await db.execute({
        sql: `SELECT u.id, u.phone, u.tg_id, u.name, u.created_at,
              s.id as sub_id, s.display_name, s.status as sub_status, s.device_limit
              FROM users u
              LEFT JOIN subscriptions s ON s.user_id = u.id
              ORDER BY u.id DESC LIMIT 100`,
        args: []
      });
    }

    return res.status(200).json({ ok: true, users: result.rows });
  } catch (e) {
    console.error('admin users', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
