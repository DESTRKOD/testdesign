import { migrate, getDb } from '../../lib/db.js';
import { hashSecret, generateCode } from '../../lib/auth.js';
import {
  toE164,
  checkSendAbility,
  sendVerificationMessage
} from '../../lib/gateway.js';
import { sendLoginCodeToUser } from '../../lib/bot.js';

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
    const hasTg = userRow?.tg_id != null && Number(userRow.tg_id) > 0;

    await db.execute({
      sql: 'DELETE FROM auth_codes WHERE phone = ?',
      args: [phone]
    });

    const expires = new Date(Date.now() + CODE_TTL_SEC * 1000).toISOString();

    if (hasTg) {
      const code = generateCode();
      await db.execute({
        sql: `INSERT INTO auth_codes (phone, channel, code_hash, expires_at)
              VALUES (?, 'bot', ?, ?)`,
        args: [phone, hashSecret(code), expires]
      });

      try {
        await sendLoginCodeToUser(Number(userRow.tg_id), code);
      } catch (e) {
        console.error('bot send code failed, fallback gateway', e.message);
        return await sendViaGateway(db, phone, expires, res);
      }

      return res.status(200).json({
        ok: true,
        channel: 'bot',
        message: 'Код отправлен в Telegram-бот'
      });
    }

    return await sendViaGateway(db, phone, expires, res);
  } catch (e) {
    console.error('send-code', e);
    return res.status(500).json({
      ok: false,
      error: e.message || 'Не удалось отправить код'
    });
  }
}

async function sendViaGateway(db, phone, expires, res) {
  let requestId;
  try {
    const ability = await checkSendAbility(phone);
    requestId = ability?.request_id;
  } catch (e) {
    console.warn('checkSendAbility', e.message);
  }

  const result = await sendVerificationMessage({
    phoneNumber: phone,
    codeLength: 6,
    ttl: 300,
    requestId,
    payload: 'destr_login'
  });

  const gwRequestId = result?.request_id || requestId;
  if (!gwRequestId) {
    throw new Error('Gateway не вернул request_id');
  }

  await db.execute({
    sql: `INSERT INTO auth_codes (phone, channel, gateway_request_id, expires_at)
          VALUES (?, 'gateway', ?, ?)`,
    args: [phone, gwRequestId, expires]
  });

  return res.status(200).json({
    ok: true,
    channel: 'gateway',
    message: 'Код отправлен в чат Verification Codes'
  });
}
