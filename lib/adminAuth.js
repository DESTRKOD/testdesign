import { checkAdminKey, isAdminTgId, verifyInitData, getSessionUser } from './auth.js';

/**
 * Admin gate:
 * - Header x-admin-key or query admin / body.adminKey === ADMIN_API_KEY
 * - AND (initData.user.id is admin TG OR session user.tg_id is admin)
 * For server-to-server tests: ADMIN_ALLOW_KEY_ONLY=1 skips TG check
 */
export async function requireAdmin(req) {
  const body =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body || '{}');
          } catch {
            return {};
          }
        })()
      : req.body || {};

  const key =
    req.headers['x-admin-key'] ||
    req.query?.admin ||
    body.adminKey ||
    '';

  if (!checkAdminKey(String(key))) {
    return { ok: false, status: 401, error: 'Invalid admin key' };
  }

  if (process.env.ADMIN_ALLOW_KEY_ONLY === '1') {
    return { ok: true, keyOnly: true };
  }

  // Telegram identity
  const initData =
    body.initData || req.headers['x-telegram-init-data'] || '';
  if (initData) {
    const tgUser = verifyInitData(initData);
    if (tgUser?.id && isAdminTgId(tgUser.id)) {
      return { ok: true, tgId: Number(tgUser.id) };
    }
  }

  const token =
    body.token ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) {
    const user = await getSessionUser(token);
    if (user?.tg_id && isAdminTgId(user.tg_id)) {
      return { ok: true, user };
    }
  }

  return {
    ok: false,
    status: 403,
    error: 'Admin Telegram account required'
  };
}
