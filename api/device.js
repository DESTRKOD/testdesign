import add from '../api-handlers/device-add.js';
import list from '../api-handlers/device-list.js';
import update from '../api-handlers/device-update.js';
import del from '../api-handlers/device-delete.js';

function actionOf(req) {
  if (req.query?.action) return String(req.query.action);
  const url = String(req.url || '');
  const m = url.match(/\/api\/device\/?([^?&#/]+)/);
  if (m && m[1] && m[1] !== 'device') return m[1];
  return '';
}

export default async function handler(req, res) {
  const action = actionOf(req).toLowerCase().replace(/\.js$/, '');
  if (action === 'add') return add(req, res);
  if (action === 'list') return list(req, res);
  if (action === 'update') return update(req, res);
  if (action === 'delete') return del(req, res);
  return res.status(404).json({ ok: false, error: 'Unknown device action: ' + action });
}
