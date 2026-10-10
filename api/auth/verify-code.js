import { migrate, getDb } from '../../lib/db.js';
import {
  hashSecret,
  timingSafeEqualStr,
  findOrCreateUserByPhone,
  createSession
} from '../../lib/auth.js';
import { toE164 } from '../../lib/gateway.js';

const CODE_MAX_ATTEMPTS = 5;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    await migrate();

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const phone = toE164(body.phone);
    const code = String(body.code || '').replace(/\D/g, '');

    if (!phone || code.length < 4 || code.length > 8) {
      return res.status(400).json({ ok: false, error: 'Некорректные данные' });
    }

    const db = getDb();
    const r = await db.execute({
      sql: `SELECT * FROM auth_codes WHERE phone = ? ORDER BY id DESC LIMIT 1`,
      args: [phone]
    });
    const row = r.rows[0];

    if (!row) {
      return res.status(400).json({
        ok: false,
        error: 'Код не найден. Запросите новый.'
      });
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({
        ok: false,
        error: 'Код истёк. Запросите новый.'
      });
    }

    if (Number(row.attempts) >= CODE_MAX_ATTEMPTS) {
      return res.status(400).json({
        ok: false,
        error: 'Слишком много попыток. Запросите новый код.'
      });
    }

    const expected = row.code_hash || row.code;
    const valid = expected && timingSafeEqualStr(String(expected), hashSecret(code));

    if (!valid) {
      await db.execute({
        sql: 'UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?',
        args: [row.id]
      });
      return res.status(400).json({
        ok: false,
        error: 'Неверный код подтверждения'
      });
    }

    await db.execute({
      sql: 'DELETE FROM auth_codes WHERE phone = ?',
      args: [phone]
    });

    const user = await findOrCreateUserByPhone(phone);
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
    console.error('verify-code', e);
    return res.status(500).json({
      ok: false,
      error: e.message || 'Server error'
    });
  }
}
