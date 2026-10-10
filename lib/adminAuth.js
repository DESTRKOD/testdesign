import { checkAdminKey, isAdminTgId, verifyInitData, getSessionUser } from './auth.js';

/**
 * Admin: x-admin-key / body.adminKey / query admin must match ADMIN_API_KEY.
 * TG check: if ADMIN_ALLOW_KEY_ONLY=1 skip; else require admin tg via initData or session.
 * If opened from browser without TG but key is correct — allow (ADMIN_ALLOW_KEY_ONLY default true when no BOT context).
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

  const allowKeyOnly =
    process.env.ADMIN_ALLOW_KEY_ONLY === '1' ||
    process.env.ADMIN_ALLOW_KEY_ONLY === 'true';

  if (allowKeyOnly) {
    return { ok: true, keyOnly: true };
  }

  const initData =
    body.initData || req.headers['x-telegram-init-data'] || '';
  if (initData) {
    const tgUser = verifyInitData(initData);
    if (tgUser?.id && isAdminTgId(tgUser.id)) {
      return { ok: true, tgId: Number(tgUser.id) };
    }
    return { ok: false, status: 403, error: 'Этот Telegram-аккаунт не админ' };
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

  // Browser without TG: require ADMIN_ALLOW_KEY_ONLY=1
  return {
    ok: false,
    status: 403,
    error: 'Нужен вход админа в Telegram или ADMIN_ALLOW_KEY_ONLY=1 в env'
  };
}
