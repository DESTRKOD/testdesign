import { migrate, getDb } from '../lib/db.js';
import { requireAdmin } from '../lib/adminAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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
    const userId = Number(body.userId || body.user_id || 0);
    const subId = Number(body.subscriptionId || body.sub_id || body.id || 0);
    const status = String(body.payment_status || body.status || '').toLowerCase();
    if (!['paid', 'unpaid'].includes(status)) {
      return res.status(400).json({
        ok: false,
        error: 'payment_status must be paid or unpaid'
      });
    }
    const db = getDb();
    if (subId) {
      await db.execute({
        sql: `UPDATE subscriptions SET payment_status = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [status, subId]
      });
    } else if (userId) {
      await db.execute({
        sql: `UPDATE subscriptions SET payment_status = ?, updated_at = datetime('now')
              WHERE id = (SELECT id FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1)`,
        args: [status, userId]
      });
    } else {
      return res.status(400).json({ ok: false, error: 'userId or subscriptionId required' });
    }
    return res.status(200).json({ ok: true, payment_status: status });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
