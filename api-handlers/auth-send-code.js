import { migrate, getDb } from '../lib/db.js';
import { hashSecret, generateCode } from '../lib/auth.js';
import { toE164 } from '../lib/gateway.js';
import { sendLoginCodeToUser } from '../lib/bot.js';

const CODE_TTL_SEC = 300;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    await migrate();

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const phone = toE164(body.phone);

    if (!phone) {
      return res.status(400).json({
        ok: false,
        error: 'Некорректный номер телефона'
      });
    }

    const db = getDb();
    const existing = await db.execute({
      sql: 'SELECT id, tg_id FROM users WHERE phone = ? LIMIT 1',
      args: [phone]
    });
    const userRow = existing.rows[0];

    if (!userRow) {
      return res.status(404).json({
        ok: false,
        error: 'Номер не найден. Войдите через Telegram, затем привяжите номер в Настройках.',
        code: 'NOT_REGISTERED'
      });
    }

    if (!userRow.tg_id) {
      return res.status(400).json({
        ok: false,
        error: 'К этому номеру ещё не привязан Telegram. Войдите через Telegram в приложении и привяжите номер в Настройках.',
        code: 'NO_TG'
      });
    }

    await db.execute({
      sql: 'DELETE FROM auth_codes WHERE phone = ?',
      args: [phone]
    });

    const code = generateCode();
    const expires = new Date(Date.now() + CODE_TTL_SEC * 1000).toISOString();

    await db.execute({
      sql: `INSERT INTO auth_codes (phone, channel, code_hash, expires_at)
            VALUES (?, 'bot', ?, ?)`,
      args: [phone, hashSecret(code), expires]
    });

    await sendLoginCodeToUser(Number(userRow.tg_id), code);

    return res.status(200).json({
      ok: true,
      channel: 'bot',
      message: 'Код отправлен в Telegram-бот'
    });
  } catch (e) {
    console.error('send-code', e);
    return res.status(500).json({
      ok: false,
      error: e.message || 'Не удалось отправить код'
    });
  }
}
