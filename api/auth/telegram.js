import { migrate } from '../../lib/db.js';
import {
  verifyInitData,
  findOrCreateUserByTg,
  createSession
} from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    await migrate();

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const initData = body.initData || '';

    const tgUser = verifyInitData(initData);
    if (!tgUser?.id) {
      return res.status(401).json({
        ok: false,
        error: 'Недействительные данные Telegram'
      });
    }

    const user = await findOrCreateUserByTg(tgUser);
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
