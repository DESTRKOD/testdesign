import { migrate, getDb } from '../lib/db.js';
import { requireAdmin } from '../lib/adminAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    await migrate();
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return res
        .status(gate.status || 403)
        .json({ ok: false, error: gate.error });
    }

    const db = getDb();
    const body =
      typeof req.body === 'string'
        ? (() => {
            try {
              return JSON.parse(req.body || '{}');
            } catch {
              return {};
            }
          })()
        : req.body || {};
    const q = String(body.q || req.query?.q || '').trim();

    let result;
    if (q) {
      const like = '%' + q + '%';
      result = await db.execute({
        sql: `SELECT u.id, u.phone, u.tg_id, u.name, u.created_at,
              (SELECT s.status FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as sub_status,
              (SELECT s.display_name FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as display_name
              FROM users u
              WHERE u.id != 0
                AND (
                  IFNULL(u.phone,'') LIKE ?
                  OR IFNULL(u.name,'') LIKE ?
                  OR CAST(u.id AS TEXT) = ?
                  OR CAST(IFNULL(u.tg_id,0) AS TEXT) = ?
                )
              ORDER BY u.id DESC LIMIT 50`,
        args: [like, like, q, q]
      });
    } else {
      result = await db.execute({
        sql: `SELECT u.id, u.phone, u.tg_id, u.name, u.created_at,
              (SELECT s.status FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as sub_status,
              (SELECT s.display_name FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as display_name
              FROM users u
              WHERE u.id != 0
              ORDER BY u.id DESC LIMIT 100`,
        args: []
      });
    }

    return res.status(200).json({ ok: true, users: result.rows || [] });
  } catch (e) {
    console.error('admin users', e);
    return res.status(500).json({
      ok: false,
      error: e.message || 'Server error'
    });
  }
}
