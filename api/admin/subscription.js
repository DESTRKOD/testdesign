import crypto from 'node:crypto';
import { migrate, getDb } from '../../lib/db.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import { createClient, setClientEnable, updateClientLimits, getPanels } from '../../lib/xui.js';
import { makeToken } from '../../lib/token.js';

function gbToBytesPanel(gb) {
  // 3x-ui totalGB field is often in GB already as number; some panels use bytes.
  // Our createClient used totalGB: 0. Keep GB units as panel expects totalGB number.
  return Number(gb) || 0;
}

function expiryMs(days) {
  const d = Number(days) || 0;
  if (d <= 0) return 0;
  return Date.now() + d * 24 * 60 * 60 * 1000;
}

async function provisionOnPanels(email, { totalGB, expiryTime, enable = true }) {
  const panels = getPanels();
  const results = [];
  for (const [name, panel] of Object.entries(panels)) {
    if (!panel?.url) {
      results.push({ name, ok: false, error: 'no url' });
      continue;
    }
    try {
      await createClient(panel, email);
      // apply limits after create
      try {
        await updateClientLimits(panel, email, {
          totalGB: gbToBytesPanel(totalGB),
          expiryTime,
          enable
        });
      } catch (e) {
        console.warn('limits', name, e.message);
      }
      results.push({ name, ok: true });
    } catch (e) {
      // maybe already exists — try update only
      try {
        await updateClientLimits(panel, email, {
          totalGB: gbToBytesPanel(totalGB),
          expiryTime,
          enable
        });
        results.push({ name, ok: true, existed: true });
      } catch (e2) {
        results.push({ name, ok: false, error: e.message + '; ' + e2.message });
      }
    }
  }
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
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
    const action = String(body.action || 'create').toLowerCase();
    const db = getDb();

    /* ---------- CREATE ---------- */
    if (action === 'create') {
      const userId = Number(body.userId || body.user_id);
      if (!userId) {
        return res.status(400).json({ ok: false, error: 'userId required' });
      }

      const u = await db.execute({
        sql: 'SELECT * FROM users WHERE id = ?',
        args: [userId]
      });
      if (!u.rows[0]) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      // one subscription per user — replace if exists
      const existing = await db.execute({
        sql: 'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        args: [userId]
      });

      const displayName = String(body.name || body.displayName || u.rows[0].name || 'Подписка');
      const totalGb = Number(body.totalGb ?? body.traffic ?? 0);
      const days = Number(body.days ?? body.expiryDays ?? 0);
      const deviceLimit = Number(body.deviceLimit ?? body.devices ?? 3);
      const expiryAt = days > 0 ? new Date(expiryMs(days)).toISOString() : null;
      const expiryTime = expiryMs(days);

      let xuiEmail;
      let subToken;

      if (existing.rows[0]) {
        xuiEmail = existing.rows[0].xui_email;
        subToken = existing.rows[0].sub_token;
      } else {
        xuiEmail =
          'dc_' + crypto.randomBytes(10).toString('hex') + '@destr.connect';
        subToken = makeToken(xuiEmail);
      }

      const panelResults = await provisionOnPanels(xuiEmail, {
        totalGB: totalGb,
        expiryTime,
        enable: true
      });

      const failed = panelResults.filter((r) => !r.ok);
      if (failed.length === panelResults.length) {
        return res.status(502).json({
          ok: false,
          error: '3x-ui: ' + failed.map((f) => f.name + ': ' + f.error).join(' | '),
          panelResults
        });
      }

      if (existing.rows[0]) {
        await db.execute({
          sql: `UPDATE subscriptions SET
            display_name = ?, total_gb = ?, expiry_days = ?, expiry_at = ?,
            device_limit = ?, status = 'active', updated_at = datetime('now')
            WHERE id = ?`,
          args: [displayName, totalGb, days, expiryAt, deviceLimit, existing.rows[0].id]
        });
      } else {
        await db.execute({
          sql: `INSERT INTO subscriptions
            (user_id, display_name, xui_email, sub_token, total_gb, expiry_days, expiry_at, device_limit, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          args: [userId, displayName, xuiEmail, subToken, totalGb, days, expiryAt, deviceLimit]
        });
      }

      const sub = await db.execute({
        sql: 'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        args: [userId]
      });

      return res.status(200).json({
        ok: true,
        subscription: mapSub(sub.rows[0]),
        panelResults
      });
    }

    /* ---------- EDIT ---------- */
    if (action === 'edit' || action === 'update') {
      const subId = Number(body.subscriptionId || body.id);
      const userId = Number(body.userId || body.user_id);
      let row;
      if (subId) {
        row = (
          await db.execute({
            sql: 'SELECT * FROM subscriptions WHERE id = ?',
            args: [subId]
          })
        ).rows[0];
      } else if (userId) {
        row = (
          await db.execute({
            sql: 'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1',
            args: [userId]
          })
        ).rows[0];
      }
      if (!row) {
        return res.status(404).json({ ok: false, error: 'Subscription not found' });
      }

      const displayName = body.name ?? body.displayName ?? row.display_name;
      const totalGb =
        body.totalGb != null || body.traffic != null
          ? Number(body.totalGb ?? body.traffic)
          : row.total_gb;
      const days =
        body.days != null || body.expiryDays != null
          ? Number(body.days ?? body.expiryDays)
          : row.expiry_days;
      const deviceLimit =
        body.deviceLimit != null || body.devices != null
          ? Number(body.deviceLimit ?? body.devices)
          : row.device_limit;
      const expiryAt = days > 0 ? new Date(expiryMs(days)).toISOString() : null;

      const panels = getPanels();
      for (const panel of Object.values(panels)) {
        if (!panel?.url) continue;
        try {
          await updateClientLimits(panel, row.xui_email, {
            totalGB: gbToBytesPanel(totalGb),
            expiryTime: expiryMs(days),
            enable: row.status !== 'blocked'
          });
        } catch (e) {
          console.warn('edit panel', e.message);
        }
      }

      await db.execute({
        sql: `UPDATE subscriptions SET
          display_name = ?, total_gb = ?, expiry_days = ?, expiry_at = ?,
          device_limit = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [displayName, totalGb, days, expiryAt, deviceLimit, row.id]
      });

      const updated = (
        await db.execute({
          sql: 'SELECT * FROM subscriptions WHERE id = ?',
          args: [row.id]
        })
      ).rows[0];

      return res.status(200).json({ ok: true, subscription: mapSub(updated) });
    }

    /* ---------- BLOCK / UNBLOCK ---------- */
    if (action === 'block' || action === 'unblock') {
      const enable = action === 'unblock';
      const subId = Number(body.subscriptionId || body.id);
      const userId = Number(body.userId || body.user_id);
      let row;
      if (subId) {
        row = (
          await db.execute({
            sql: 'SELECT * FROM subscriptions WHERE id = ?',
            args: [subId]
          })
        ).rows[0];
      } else if (userId) {
        row = (
          await db.execute({
            sql: 'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1',
            args: [userId]
          })
        ).rows[0];
      }
      if (!row) {
        return res.status(404).json({ ok: false, error: 'Subscription not found' });
      }

      const panels = getPanels();
      const panelResults = [];
      for (const [name, panel] of Object.entries(panels)) {
        if (!panel?.url) continue;
        try {
          await setClientEnable(panel, row.xui_email, enable);
          panelResults.push({ name, ok: true });
        } catch (e) {
          panelResults.push({ name, ok: false, error: e.message });
        }
      }

      await db.execute({
        sql: `UPDATE subscriptions SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [enable ? 'active' : 'blocked', row.id]
      });

      return res.status(200).json({
        ok: true,
        status: enable ? 'active' : 'blocked',
        panelResults
      });
    }

    /* ---------- GET by user ---------- */
    if (action === 'get') {
      const userId = Number(body.userId || body.user_id);
      if (!userId) {
        return res.status(400).json({ ok: false, error: 'userId required' });
      }
      const sub = await db.execute({
        sql: 'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        args: [userId]
      });
      return res.status(200).json({
        ok: true,
        subscription: sub.rows[0] ? mapSub(sub.rows[0]) : null
      });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('admin subscription', e);
    return res.status(500).json({ ok: false, error: e.message || 'Server error' });
  }
}

function mapSub(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    xuiEmail: row.xui_email,
    subToken: row.sub_token,
    totalGb: row.total_gb,
    expiryDays: row.expiry_days,
    expiryAt: row.expiry_at,
    deviceLimit: row.device_limit,
    status: row.status
  };
}
