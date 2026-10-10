import { migrate, getDb } from '../../lib/db.js';
import { getSessionUser } from '../../lib/auth.js';

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
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const db = getDb();
    const subR = await db.execute({
      sql: `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      args: [user.id]
    });
    const sub = subR.rows[0];
    if (!sub) {
      return res.status(404).json({
        ok: false,
        error: 'Подписка не найдена. Обратитесь к администратору.'
      });
    }
    if (sub.status === 'blocked') {
      return res.status(403).json({ ok: false, error: 'Подписка заблокирована' });
    }

    const cntR = await db.execute({
      sql: `SELECT COUNT(*) as c FROM devices WHERE subscription_id = ?`,
      args: [sub.id]
    });
    const count = Number(cntR.rows[0]?.c || 0);
    const limit = Number(sub.device_limit || 3);

    if (count >= limit) {
      return res.status(403).json({
        ok: false,
        error: `Лимит устройств: ${limit}`,
        deviceCount: count,
        deviceLimit: limit
      });
    }

    await db.execute({
      sql: `INSERT INTO devices (subscription_id, user_id, user_agent) VALUES (?, ?, ?)`,
      args: [sub.id, user.id, req.headers['user-agent'] || null]
    });

    const origin =
      (req.headers['x-forwarded-proto'] || 'https') +
      '://' +
      (req.headers['x-forwarded-host'] || req.headers.host || '');

    const subUrl =
      origin + '/api/sub?token=' + encodeURIComponent(sub.sub_token);

    return res.status(200).json({
      ok: true,
      deviceCount: count + 1,
      deviceLimit: limit,
      subscriptionUrl: subUrl,
      subToken: sub.sub_token
    });
  } catch (e) {
    console.error('device add', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
