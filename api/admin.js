import subscription from '../api-handlers/admin-subscription.js';
import users from '../api-handlers/admin-users.js';
import panelsCheck from '../api-handlers/admin-panels-check.js';
import userDetail from '../api-handlers/admin-user-detail.js';
import setPhone from '../api-handlers/admin-set-phone.js';

function actionOf(req) {
  if (req.query?.action) return String(req.query.action);
  const url = String(req.url || '');
  const m = url.match(/\/api\/admin\/?([^?&#/]+)/);
  if (m && m[1] && m[1] !== 'admin') return m[1];
  return 'subscription';
}

export default async function handler(req, res) {
  let action = actionOf(req).toLowerCase().replace(/\.js$/, '');
  if (!action || action === 'admin') action = 'subscription';
  if (action === 'subscription') return subscription(req, res);
  if (action === 'users') return users(req, res);
  if (action === 'panels-check') return panelsCheck(req, res);
  if (action === 'user' || action === 'user-detail') return userDetail(req, res);
  if (action === 'set-phone') return setPhone(req, res);
  return res.status(404).json({ ok: false, error: 'Unknown admin action: ' + action });
}
