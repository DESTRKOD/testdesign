import { migrate, getDb } from '../lib/db.js';
import { requireAdmin } from '../lib/adminAuth.js';
import { getTrafficForEmail } from '../lib/traffic.js';
import { toE164 } from '../lib/gateway.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    await migrate();
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return res.status(gate.status || 403).json({ ok: false, error: gate.error });
    }

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const userId = Number(
      body.userId || body.user_id || body.id || req.query?.userId || req.query?.id
    );
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId required' });
    }

    const db = getDb();
    const u = await db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId]
    });
    const user = u.rows[0];
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const subR = await db.execute({
      sql: `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      args: [userId]
    });
    const sub = subR.rows[0] || null;

    let deviceCount = 0;
    let traffic = { up: 0, down: 0, total: 0, usedGb: 0 };

    if (sub) {
      const d = await db.execute({
        sql: `SELECT COUNT(*) as c FROM devices WHERE subscription_id = ?`,
        args: [sub.id]
      });
      deviceCount = Number(d.rows[0]?.c || 0);
      try {
        traffic = await getTrafficForEmail(sub.xui_email);
        traffic.usedGb =
          Math.round(((traffic.total || 0) / (1024 * 1024 * 1024)) * 100) / 100;
      } catch (e) {
        console.warn('admin traffic', e.message);
      }
    }

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        phone: user.phone,
        tg_id: user.tg_id,
        name: user.name,
        created_at: user.created_at
      },
      subscription: sub
        ? {
            id: sub.id,
            displayName: sub.display_name,
            totalGb: Number(sub.total_gb || 0),
            expiryAt: sub.expiry_at,
            deviceLimit: sub.device_limit,
            deviceCount,
            status: sub.status,
            xuiEmail: sub.xui_email,
            subToken: sub.sub_token
          }
        : null,
      traffic: {
        uploadBytes: traffic.up || 0,
        downloadBytes: traffic.down || 0,
        usedBytes: traffic.total || 0,
        usedGb: traffic.usedGb || 0
      }
    });
  } catch (e) {
    console.error('admin user detail', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
