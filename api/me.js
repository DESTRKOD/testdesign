import { migrate } from '../lib/db.js';
import { getSessionUser } from '../lib/auth.js';
import { getTrafficForEmail } from '../lib/traffic.js';
import { getDb } from '../lib/db.js';

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const body = typeof req.body === 'string' ? {} : req.body || {};
  return body.token || req.query?.token || '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
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
    const subscription = subR.rows[0] || null;
    let deviceCount = 0;
    let up = 0;
    let down = 0;

    if (subscription) {
      const d = await db.execute({
        sql: `SELECT COUNT(*) as c FROM devices WHERE subscription_id = ?`,
        args: [subscription.id]
      });
      deviceCount = Number(d.rows[0]?.c || 0);

      try {
        const t = await getTrafficForEmail(subscription.xui_email);
        up = t.up;
        down = t.down;
      } catch (_) {}
    }

    const usedBytes = up + down;
    const usedGb = Math.round((usedBytes / (1024 * 1024 * 1024)) * 100) / 100;
    const totalGb = subscription ? Number(subscription.total_gb || 0) : 0;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        tg_id: user.tg_id,
        theme: user.theme,
        hasPin: !!user.pin_hash,
        faceId: !!user.face_id
      },
      subscription: subscription
        ? {
            id: subscription.id,
            displayName: subscription.display_name,
            totalGb,
            usedGb,
            usedBytes,
            uploadBytes: up,
            downloadBytes: down,
            expiryAt: subscription.expiry_at,
            deviceLimit: subscription.device_limit,
            deviceCount,
            status: subscription.status,
            subToken: subscription.sub_token
          }
        : null
    });
  } catch (e) {
    console.error('me', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
