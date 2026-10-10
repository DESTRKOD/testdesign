import { getClientTraffic, getPanels } from './xui.js';
import { getDb } from './db.js';

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) =>
      setTimeout(() => resolve({ up: 0, down: 0, total: 0 }), ms)
    )
  ]);
}

/**
 * Sum upload/download across all panels for client email.
 * Same source for Mini App (/api/me) and Happ (/api/sub headers).
 */
export async function getTrafficForEmail(email, timeoutMs = 2500) {
  const panels = Object.values(getPanels()).filter((p) => p?.url);
  let up = 0;
  let down = 0;
  await Promise.all(
    panels.map(async (panel) => {
      try {
        const t = await withTimeout(
          getClientTraffic(panel, email).catch(() => ({
            up: 0,
            down: 0,
            total: 0
          })),
          timeoutMs
        );
        up += Number(t.up || 0);
        down += Number(t.down || 0);
      } catch (_) {}
    })
  );
  return {
    up,
    down,
    total: up + down
  };
}

/** Lookup subscription row by xui email */
export async function getSubscriptionByEmail(email) {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT * FROM subscriptions WHERE xui_email = ? ORDER BY id DESC LIMIT 1`,
    args: [email]
  });
  return r.rows[0] || null;
}

/**
 * Build Subscription-Userinfo header values.
 * totalGB 0 → total=0 (unlimited for many clients)
 * expire: unix seconds, 0 if none
 */
export function buildUserinfoHeader({ up, down, totalGb, expiryAt }) {
  const totalBytes =
    totalGb && Number(totalGb) > 0
      ? Math.round(Number(totalGb) * 1024 * 1024 * 1024)
      : 0;
  let expire = 0;
  if (expiryAt) {
    const ms = new Date(expiryAt).getTime();
    if (!Number.isNaN(ms) && ms > 0) expire = Math.floor(ms / 1000);
  }
  return `upload=${Math.round(up)}; download=${Math.round(down)}; total=${totalBytes}; expire=${expire}`;
}

export function profileTitleHeader(name) {
  const title = name || 'Destr Connect';
  // Happ / v2rayN: plain or base64 with prefix
  try {
    const b64 = Buffer.from(title, 'utf8').toString('base64');
    return `base64:${b64}`;
  } catch {
    return title;
  }
}
