import { migrate, getDb } from '../lib/db.js';
import { requireAdmin } from '../lib/adminAuth.js';
import { toE164 } from '../lib/gateway.js';

/**
 * Admin sets phone on a user.
 * body: { userId, phone, force?: true }
 * If phone belongs to another user:
 *   - force=false → 409 with otherUserId
 *   - force=true → move phone to target (clear from other)
 */
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
    const phoneRaw = body.phone;
    const force = body.force === true || body.force === '1';

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId required' });
    }

    // empty phone = unlink
    if (phoneRaw === '' || phoneRaw === null) {
      const db = getDb();
      await db.execute({
        sql: `UPDATE users SET phone = NULL, updated_at = datetime('now') WHERE id = ?`,
        args: [userId]
      });
      return res.status(200).json({ ok: true, phone: null, unlinked: true });
    }

    const phone = toE164(phoneRaw);
    if (!phone) {
      return res.status(400).json({ ok: false, error: 'Некорректный номер' });
    }

    const db = getDb();
    const target = await db.execute({
      sql: 'SELECT id FROM users WHERE id = ?',
      args: [userId]
    });
    if (!target.rows[0]) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const other = await db.execute({
      sql: `SELECT id, tg_id, name FROM users WHERE phone = ? AND id != ?`,
      args: [phone, userId]
    });
    const otherUser = other.rows[0];

    if (otherUser && !force) {
      return res.status(409).json({
        ok: false,
        error: 'Номер уже у пользователя #' + otherUser.id,
        code: 'PHONE_TAKEN',
        otherUserId: otherUser.id,
        otherTgId: otherUser.tg_id,
        otherName: otherUser.name
      });
    }

    if (otherUser && force) {
      await db.execute({
        sql: `UPDATE users SET phone = NULL, updated_at = datetime('now') WHERE id = ?`,
        args: [otherUser.id]
      });
    }

    await db.execute({
      sql: `UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [phone, userId]
    });

    return res.status(200).json({
      ok: true,
      phone,
      movedFrom: otherUser ? otherUser.id : null
    });
  } catch (e) {
    console.error('admin set-phone', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
