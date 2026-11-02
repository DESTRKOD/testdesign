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

    // Real users (id != 0)
    let usersSql;
    let usersArgs = [];
    if (q) {
      const like = '%' + q + '%';
      usersSql = `SELECT u.id, u.phone, u.tg_id, u.name, u.created_at,
        (SELECT s.id FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as sub_id,
        (SELECT s.status FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as sub_status,
        (SELECT s.display_name FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as display_name,
        (SELECT s.payment_status FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as payment_status,
        (SELECT s.sub_token FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as sub_token
        FROM users u
        WHERE u.id != 0
          AND (
            IFNULL(u.phone,'') LIKE ?
            OR IFNULL(u.name,'') LIKE ?
            OR CAST(u.id AS TEXT) = ?
            OR CAST(IFNULL(u.tg_id,0) AS TEXT) = ?
          )
        ORDER BY u.id DESC LIMIT 100`;
      usersArgs = [like, like, q, q];
    } else {
      usersSql = `SELECT u.id, u.phone, u.tg_id, u.name, u.created_at,
        (SELECT s.id FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as sub_id,
        (SELECT s.status FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as sub_status,
        (SELECT s.display_name FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as display_name,
        (SELECT s.payment_status FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as payment_status,
        (SELECT s.sub_token FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.id DESC LIMIT 1) as sub_token
        FROM users u
        WHERE u.id != 0
        ORDER BY u.id DESC LIMIT 100`;
    }
    const usersR = await db.execute({ sql: usersSql, args: usersArgs });

    // Orphan / link-only subscriptions (user_id = 0 or NULL)
    let orphansSql;
    let orphansArgs = [];
    if (q) {
      const like = '%' + q + '%';
      orphansSql = `SELECT s.id as sub_id, s.display_name, s.status as sub_status,
        s.payment_status, s.sub_token, s.xui_email, s.created_at, s.user_id
        FROM subscriptions s
        WHERE (s.user_id = 0 OR s.user_id IS NULL)
          AND (
            IFNULL(s.display_name,'') LIKE ?
            OR IFNULL(s.xui_email,'') LIKE ?
            OR CAST(s.id AS TEXT) = ?
          )
        ORDER BY s.id DESC LIMIT 100`;
      orphansArgs = [like, like, q];
    } else {
      orphansSql = `SELECT s.id as sub_id, s.display_name, s.status as sub_status,
        s.payment_status, s.sub_token, s.xui_email, s.created_at, s.user_id
        FROM subscriptions s
        WHERE s.user_id = 0 OR s.user_id IS NULL
        ORDER BY s.id DESC LIMIT 100`;
    }
    let orphans = [];
    try {
      const o = await db.execute({ sql: orphansSql, args: orphansArgs });
      orphans = o.rows || [];
    } catch (e) {
      // payment_status column may not exist yet on first request before migrate runs fully
      console.warn('orphans query', e.message);
    }

    const users = (usersR.rows || []).map((u) => ({
      kind: 'user',
      id: u.id,
      phone: u.phone,
      tg_id: u.tg_id,
      name: u.name,
      created_at: u.created_at,
      sub_id: u.sub_id,
      sub_status: u.sub_status,
      display_name: u.display_name,
      payment_status: u.payment_status || 'unknown',
      sub_token: u.sub_token
    }));

    const orphanRows = orphans.map((s) => ({
      kind: 'orphan',
      id: null,
      sub_id: s.sub_id,
      phone: null,
      tg_id: null,
      name: s.display_name || s.xui_email,
      created_at: s.created_at,
      sub_status: s.sub_status,
      display_name: s.display_name,
      payment_status: s.payment_status || 'unknown',
      sub_token: s.sub_token,
      xui_email: s.xui_email
    }));

    return res.status(200).json({
      ok: true,
      users: [...orphanRows, ...users]
    });
  } catch (e) {
    console.error('admin users', e);
    return res.status(500).json({
      ok: false,
      error: e.message || 'Server error'
    });
  }
}
