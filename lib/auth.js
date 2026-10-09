import crypto from 'node:crypto';
import { getDb } from './db.js';

const SESSION_DAYS = 30;
const CODE_TTL_SEC = 300; // 5 min
const CODE_MAX_ATTEMPTS = 5;

/* ---------- helpers ---------- */

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashSecret(value) {
  const salt = process.env.APP_SECRET || 'destr-dev-secret';
  return crypto.createHmac('sha256', salt).update(String(value)).digest('hex');
}

export function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ---------- Telegram initData verification ---------- */

/**
 * Verify Telegram WebApp initData (HMAC-SHA256 with bot token).
 * Returns parsed user object or null.
 */
export function verifyInitData(initData) {
  if (!initData || typeof initData !== 'string') return null;

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error('BOT_TOKEN not set');
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculated = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!timingSafeEqualStr(calculated, hash)) return null;

  const authDate = Number(params.get('auth_date') || 0);
  const maxAge = 86400; // 24h
  if (!authDate || Date.now() / 1000 - authDate > maxAge) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user;
  } catch {
    return null;
  }
}

/* ---------- Phone codes ---------- */

export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function storeAuthCode(phone, code) {
  const db = getDb();
  const expires = new Date(Date.now() + CODE_TTL_SEC * 1000).toISOString();

  // invalidate previous codes for this phone
  await db.execute({
    sql: 'DELETE FROM auth_codes WHERE phone = ?',
    args: [phone]
  });

  await db.execute({
    sql: 'INSERT INTO auth_codes (phone, code, expires_at) VALUES (?, ?, ?)',
    args: [phone, hashSecret(code), expires]
  });
}

export async function verifyAuthCode(phone, code) {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, code, attempts, expires_at FROM auth_codes
          WHERE phone = ? ORDER BY id DESC LIMIT 1`,
    args: [phone]
  });

  const row = r.rows[0];
  if (!row) return { ok: false, error: 'Код не найден. Запросите новый.' };

  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, error: 'Код истёк. Запросите новый.' };
  }

  if (Number(row.attempts) >= CODE_MAX_ATTEMPTS) {
    return { ok: false, error: 'Слишком много попыток. Запросите новый код.' };
  }

  const match = timingSafeEqualStr(row.code, hashSecret(code));

  if (!match) {
    await db.execute({
      sql: 'UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?',
      args: [row.id]
    });
    return { ok: false, error: 'Неверный код подтверждения' };
  }

  await db.execute({
    sql: 'DELETE FROM auth_codes WHERE phone = ?',
    args: [phone]
  });

  return { ok: true };
}

/* ---------- Users & sessions ---------- */

export async function findOrCreateUserByPhone(phone) {
  const db = getDb();
  let r = await db.execute({
    sql: 'SELECT * FROM users WHERE phone = ?',
    args: [phone]
  });

  if (r.rows[0]) return r.rows[0];

  await db.execute({
    sql: 'INSERT INTO users (phone) VALUES (?)',
    args: [phone]
  });

  r = await db.execute({
    sql: 'SELECT * FROM users WHERE phone = ?',
    args: [phone]
  });
  return r.rows[0];
}

export async function findOrCreateUserByTg(tgUser) {
  const db = getDb();
  const tgId = Number(tgUser.id);

  let r = await db.execute({
    sql: 'SELECT * FROM users WHERE tg_id = ?',
    args: [tgId]
  });

  if (r.rows[0]) {
    // refresh name
    const name =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') ||
      tgUser.username ||
      null;
    if (name) {
      await db.execute({
        sql: `UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [name, r.rows[0].id]
      });
    }
    return (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [r.rows[0].id] })).rows[0];
  }

  const name =
    [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') ||
    tgUser.username ||
    null;

  await db.execute({
    sql: 'INSERT INTO users (tg_id, name) VALUES (?, ?)',
    args: [tgId, name]
  });

  r = await db.execute({
    sql: 'SELECT * FROM users WHERE tg_id = ?',
    args: [tgId]
  });
  return r.rows[0];
}

export async function createSession(userId, userAgent = '') {
  const db = getDb();
  const id = randomToken(32);
  const expires = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await db.execute({
    sql: 'INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)',
    args: [id, userId, expires, userAgent || null]
  });

  return { token: id, expiresAt: expires };
}

export async function getSessionUser(token) {
  if (!token) return null;
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT u.* FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND s.expires_at > datetime('now')`,
    args: [token]
  });
  return r.rows[0] || null;
}

export async function destroySession(token) {
  if (!token) return;
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM sessions WHERE id = ?',
    args: [token]
  });
}

/** Admin: TG id must match + optional admin key */
export function isAdminTgId(tgId) {
  const allowed = String(process.env.ADMIN_TG_ID || '2112942356');
  return String(tgId) === allowed;
}

export function checkAdminKey(key) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return false;
  return timingSafeEqualStr(key || '', expected);
}

/* ---------- Send code via Telegram bot to user / VerificationCodes flow ---------- */

/**
 * Your flow uses @VerificationCodes — typically the bot sends the code
 * to the user in Telegram after they shared the phone, OR you push to a channel.
 * Hook: implement with BOT_TOKEN sendMessage.
 */
export async function sendCodeViaBot(phone, code, tgChatId = null) {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.warn('BOT_TOKEN missing — code logged for dev:', code);
    return { ok: true, dev: true, code };
  }

  // If we know chat id — send directly
  if (tgChatId) {
    const text = `Код входа Destr VPN: <b>${code}</b>\nДействует 5 минут.`;
    const r = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text,
          parse_mode: 'HTML'
        })
      }
    );
    const j = await r.json();
    if (!j.ok) throw new Error(j.description || 'Telegram send failed');
    return { ok: true };
  }

  // Fallback: log for integration with VerificationCodes service
  console.log('[auth-code]', phone, code);
  return { ok: true, logged: true };
}
