import { checkAllPanelsHealth } from '../lib/xui.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const servers = await checkAllPanelsHealth();
    // If no panels configured, show known slots as offline
    const result = servers.map((s) => {
      let status = 'down';
      let message = 'наблюдаются сбои. рекомендуем использовать другие сервера';
      if (s.ok) {
        status = 'up';
        message = 'работает в данный момент';
      } else if (s.ms != null && s.ms < 4000) {
        status = 'degraded';
        message = 'наблюдаются сбои. рекомендуем использовать другие сервера';
      }
      return {
        key: s.key,
        label: s.label,
        status,
        message,
        ms: s.ms,
        error: s.ok ? undefined : s.error
      };
    });
    return res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      servers: result
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
