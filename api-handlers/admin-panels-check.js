import { getPanels } from '../lib/xui.js';
import { requireAdmin } from '../lib/adminAuth.js';

export default async function handler(req, res) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return res.status(gate.status || 403).json({ ok: false, error: gate.error });
    }

    const panels = getPanels();
    const out = {};

    for (const [key, p] of Object.entries(panels)) {
      const hasToken = Boolean(p.token && String(p.token).trim());
      const hasUrl = Boolean(p.url);
      out[key] = {
        hasUrl,
        hasToken,
        tokenLength: hasToken ? String(p.token).trim().length : 0,
        inboundId: p.inboundId,
        server: p.server || null,
        // probe list if token present
        probe: null
      };

      if (hasUrl && hasToken) {
        try {
          const r = await fetch(
            String(p.url).replace(/\/$/, '') + '/panel/api/inbounds/list',
            {
              headers: {
                Authorization: 'Bearer ' + String(p.token).trim(),
                Accept: 'application/json'
              }
            }
          );
          const text = await r.text();
          let j = {};
          try {
            j = JSON.parse(text);
          } catch {
            j = {};
          }
          out[key].probe = {
            status: r.status,
            success: j.success,
            msg: j.msg || text.slice(0, 120)
          };
        } catch (e) {
          out[key].probe = { error: e.message };
        }
      }
    }

    return res.status(200).json({ ok: true, panels: out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
