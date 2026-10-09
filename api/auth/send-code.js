import { migrate } from '../../lib/db.js';
import {
  generateCode,
  storeAuthCode,
  sendCodeViaBot
} from '../../lib/auth.js';

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  // store with +
  if (String(raw).trim().startsWith('+')) {
    return '+' + digits;
  }
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

    if (!phone) {
      return res.status(400).json({ ok: false, error: 'Некорректный номер телефона' });
    }

    const code = generateCode();
    await storeAuthCode(phone, code);

    // Optional: body.tgChatId if already known
    const sendResult = await sendCodeViaBot(phone, code, body.tgChatId || null);

    const payload = { ok: true };
    // Only expose code in non-production for testing
    if (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEV_EXPOSE_CODE === '1') {
      payload.devCode = code;
    }
    if (sendResult.dev) payload.dev = true;

    return res.status(200).json(payload);
  } catch (e) {
    console.error('send-code', e);
    return res.status(500).json({ ok: false, error: e.message || 'Server error' });
  }
}
