import { migrate } from '../../lib/db.js';
import {
  verifyAuthCode,
  findOrCreateUserByPhone,
  createSession
} from '../../lib/auth.js';

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (String(raw).trim().startsWith('+')) return '+' + digits;
  return '+' + digits;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    await migrate();

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const phone = normalizePhone(body.phone);
    const code = String(body.code || '').replace(/\D/g, '');

    if (!phone || code.length !== 6) {
      return res.status(400).json({ ok: false, error: 'Некорректные данные' });
    }

    const check = await verifyAuthCode(phone, code);
    if (!check.ok) {
      return res.status(400).json({ ok: false, error: check.error });
    }

    const user = await findOrCreateUserByPhone(phone);
    const session = await createSession(
      user.id,
      req.headers['user-agent'] || ''
    );

    // Need 2FA setup if no password yet
    const need2fa = !user.password_hash;

    return res.status(200).json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      need2fa,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        tg_id: user.tg_id
      }
    });
  } catch (e) {
    console.error('verify-code', e);
    return res.status(500).json({ ok: false, error: e.message || 'Server error' });
  }
}
