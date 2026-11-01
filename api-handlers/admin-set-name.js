
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
    const userId = Number(body.userId || body.user_id);
    const name = String(body.name || '').trim().slice(0, 80);
    if (!userId || !name) {
      return res.status(400).json({ ok: false, error: 'userId and name required' });
    }
    const db = getDb();
    await db.execute({
      sql: `UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [name, userId]
    });
    await db.execute({
      sql: `UPDATE subscriptions SET display_name = ?, updated_at = datetime('now') WHERE user_id = ?`,
      args: [name, userId]
    });
    return res.status(200).json({ ok: true, name });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
