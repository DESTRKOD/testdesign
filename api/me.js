import { migrate, getDb } from '../lib/db.js';
import { getSessionUser } from '../lib/auth.js';
import { getClientTraffic, getPanels } from '../lib/xui.js';

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
    let usedBytes = 0;

    if (subscription) {
      const d = await db.execute({
        sql: `SELECT COUNT(*) as c FROM devices WHERE subscription_id = ?`,
        args: [subscription.id]
      });
      deviceCount = Number(d.rows[0]?.c || 0);

      // sum traffic from panels
      const panels = getPanels();
      for (const panel of Object.values(panels)) {
        if (!panel?.url) continue;
        try {
          const t = await getClientTraffic(panel, subscription.xui_email);
          usedBytes += t.total || 0;
        } catch (e) {
          console.warn('traffic', e.message);
        }
      }
    }

    const usedGb = usedBytes / (1024 * 1024 * 1024);
    const totalGb = subscription ? Number(subscription.total_gb || 0) : 0;

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
            usedGb: Math.round(usedGb * 100) / 100,
            usedBytes,
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
