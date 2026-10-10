import phone from '../api-handlers/account-phone.js';

function actionOf(req) {
  if (req.query?.action) return String(req.query.action);
  const url = String(req.url || '');
  const m = url.match(/\/api\/account\/?([^?&#/]+)/);
  if (m && m[1] && m[1] !== 'account') return m[1];
  return 'phone';
}

export default async function handler(req, res) {
  const action = actionOf(req).toLowerCase().replace(/\.js$/, '');
  if (action === 'phone') return phone(req, res);
  return res.status(404).json({ ok: false, error: 'Unknown account action: ' + action });
}
