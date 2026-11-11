/**
 * Public base URL for subscription links (Happ) and admin.
 * Always prefer PUBLIC_SUB_URL so RF users don't hit Vercel.
 *
 * Env:
 *   PUBLIC_SUB_URL=https://sub.shopdxs.ru
 *   PUBLIC_ADMIN_URL=https://sub.shopdxs.ru/connect  (optional)
 */
export function publicSubBase() {
  const raw =
    process.env.PUBLIC_SUB_URL ||
    process.env.SUB_PUBLIC_URL ||
    process.env.SUB_BASE_URL ||
    'https://sub.shopdxs.ru';
  return String(raw).replace(/\/$/, '');
}

export function publicAdminBase() {
  const raw =
    process.env.PUBLIC_ADMIN_URL ||
    publicSubBase() + '/connect';
  return String(raw).replace(/\/$/, '');
}

/** Full subscription URL for Happ */
export function subscriptionUrlForToken(token) {
  const t = encodeURIComponent(String(token || '').trim());
  return publicSubBase() + '/api/sub?token=' + t;
}

/** Fallback origin from request only if env missing (should rarely use) */
export function requestOrigin(req) {
  const env = publicSubBase();
  if (env && !env.includes('vercel.app')) return env;
  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  const host =
    req?.headers?.['x-forwarded-host'] || req?.headers?.host || '';
  if (host) return proto + '://' + host;
  return env;
}
