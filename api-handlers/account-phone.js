import { migrate, getDb } from '../lib/db.js';
import { getSessionUser } from '../lib/auth.js';
import { toE164 } from '../lib/gateway.js';

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const body = typeof req.body === 'string' ? {} : req.body || {};
  return body.token || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    await migrate();
    const user = await getSessionUser(getToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const phone = toE164(body.phone);
    if (!phone) {
      return res.status(400).json({ ok: false, error: 'Некорректный номер' });
    }

    const db = getDb();
    const other = await db.execute({
      sql: `SELECT id FROM users WHERE phone = ? AND id != ?`,
      args: [phone, user.id]
    });
    if (other.rows[0]) {
      return res.status(409).json({
        ok: false,
        error: 'Этот номер уже привязан к другому аккаунту'
      });
    }

    await db.execute({
      sql: `UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [phone, user.id]
    });

    return res.status(200).json({ ok: true, phone });
  } catch (e) {
    console.error('phone', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
