import sendCode from '../api-handlers/auth-send-code.js';
import verifyCode from '../api-handlers/auth-verify-code.js';
import telegram from '../api-handlers/auth-telegram.js';
import logout from '../api-handlers/auth-logout.js';

function actionOf(req) {
  if (req.query?.action) return String(req.query.action);
  const url = String(req.url || '');
  const m = url.match(/\/api\/auth\/?([^?&#/]+)/);
  if (m && m[1] && m[1] !== 'auth') return m[1];
  return '';
}

export default async function handler(req, res) {
  const action = actionOf(req).toLowerCase().replace(/\.js$/, '');
  if (action === 'send-code') return sendCode(req, res);
  if (action === 'verify-code') return verifyCode(req, res);
  if (action === 'telegram') return telegram(req, res);
  if (action === 'logout') return logout(req, res);
  return res.status(404).json({ ok: false, error: 'Unknown auth action: ' + action });
}
