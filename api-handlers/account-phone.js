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

    // Same user already has this phone
    if (user.phone === phone) {
      return res.status(200).json({ ok: true, phone, merged: false });
    }

    const other = await db.execute({
      sql: `SELECT * FROM users WHERE phone = ? AND id != ?`,
      args: [phone, user.id]
    });
    const otherUser = other.rows[0];

    if (otherUser) {
      // Other account has this phone AND a different tg_id → real conflict
      if (
        otherUser.tg_id &&
        user.tg_id &&
        Number(otherUser.tg_id) !== Number(user.tg_id)
      ) {
        return res.status(409).json({
          ok: false,
          error:
            'Этот номер уже привязан к другому Telegram-аккаунту. Войдите тем аккаунтом или обратитесь к админу.'
        });
      }

      // Merge: phone-only account (or same tg) into current session user
      // Move subscriptions, devices, sessions from other → current
      await db.execute({
        sql: `UPDATE subscriptions SET user_id = ? WHERE user_id = ?`,
        args: [user.id, otherUser.id]
      });
      await db.execute({
        sql: `UPDATE devices SET user_id = ? WHERE user_id = ?`,
        args: [user.id, otherUser.id]
      });
      await db.execute({
        sql: `DELETE FROM sessions WHERE user_id = ?`,
        args: [otherUser.id]
      });
      // free phone on other row then delete other user
      await db.execute({
        sql: `UPDATE users SET phone = NULL WHERE id = ?`,
        args: [otherUser.id]
      });
      await db.execute({
        sql: `DELETE FROM users WHERE id = ?`,
        args: [otherUser.id]
      });
    }

    await db.execute({
      sql: `UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [phone, user.id]
    });

    return res.status(200).json({ ok: true, phone, merged: !!otherUser });
  } catch (e) {
    console.error('phone', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
