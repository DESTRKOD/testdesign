import { migrate, getDb } from '../lib/db.js';
import {
  verifyInitData,
  findOrCreateUserByTg,
  createSession
} from '../lib/auth.js';
import { toE164 } from '../lib/gateway.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    await migrate();

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const initData = body.initData || '';

    const tgUser = verifyInitData(initData);
    if (!tgUser?.id) {
      return res.status(401).json({
        ok: false,
        error: 'Недействительные данные Telegram'
      });
    }

    const user = await findOrCreateUserByTg(tgUser);

    // Optional: link phone from current login flow
    const phone = body.phone ? toE164(body.phone) : null;
    if (phone && !user.phone) {
      const db = getDb();
      try {
        await db.execute({
          sql: `UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?`,
          args: [phone, user.id]
        });
        user.phone = phone;
      } catch (e) {
        // phone already taken by another account — ignore link
        console.warn('phone link skip', e.message);
      }
    }

    // If user logged in via phone session token + now opens mini app — merge tg_id
    if (body.sessionToken && phone) {
      const db = getDb();
      const s = await db.execute({
        sql: `SELECT u.id, u.phone FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.id = ? AND s.expires_at > datetime('now')`,
        args: [body.sessionToken]
      });
      const sessionUser = s.rows[0];
      if (sessionUser && !sessionUser.tg_id) {
        try {
          await db.execute({
            sql: `UPDATE users SET tg_id = ?, name = COALESCE(name, ?), updated_at = datetime('now') WHERE id = ?`,
            args: [
              Number(tgUser.id),
              [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || null,
              sessionUser.id
            ]
          });
        } catch (e) {
          console.warn('tg link skip', e.message);
        }
      }
    }

    const session = await createSession(
      user.id,
      req.headers['user-agent'] || ''
    );

    return res.status(200).json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      need2fa: !user.password_hash,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        tg_id: user.tg_id
      }
    });
  } catch (e) {
    console.error('telegram-auth', e);
    return res.status(500).json({ ok: false, error: e.message || 'Server error' });
  }
}
