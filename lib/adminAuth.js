import { checkAdminKey, isAdminTgId, verifyInitData, getSessionUser } from './auth.js';

/**
 * Admin gate:
 * - ADMIN_API_KEY must match (header x-admin-key / body.adminKey / ?admin=)
 * - By default key alone is enough (desktop admin panel in browser).
 * - Set ADMIN_REQUIRE_TG=1 to also require admin Telegram id.
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

  const key = String(
    req.headers['x-admin-key'] ||
      req.query?.admin ||
      body.adminKey ||
      ''
  ).trim();

  if (!process.env.ADMIN_API_KEY) {
    return {
      ok: false,
      status: 500,
      error:
        'ADMIN_API_KEY is not set on Vercel. Settings → Environment Variables → Production → Redeploy.'
    };
  }

  if (!key || !checkAdminKey(key)) {
    return {
      ok: false,
      status: 401,
      error:
        'Invalid admin key. Открой сайт как ?admin=ТВОЙ_ADMIN_API_KEY (тот же ключ, что в Vercel ADMIN_API_KEY).'
    };
  }

  const requireTg =
    process.env.ADMIN_REQUIRE_TG === '1' ||
    process.env.ADMIN_REQUIRE_TG === 'true';

  if (!requireTg) {
    return { ok: true, keyOnly: true };
  }

  const initData =
    body.initData || req.headers['x-telegram-init-data'] || '';
  if (initData) {
    const tgUser = verifyInitData(initData);
    if (tgUser?.id && isAdminTgId(tgUser.id)) {
      return { ok: true, tgId: Number(tgUser.id) };
    }
    return {
      ok: false,
      status: 403,
      error: 'Этот Telegram-аккаунт не админ'
    };
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
    error: 'Нужен Telegram-админ (ADMIN_REQUIRE_TG=1)'
  };
}
