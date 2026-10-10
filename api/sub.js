import {
  getClient,
  getInbound,
  getPanels
} from '../lib/xui.js';

import { readToken } from '../lib/token.js';
import { migrate } from '../lib/db.js';
import {
  getTrafficForEmail,
  getSubscriptionByEmail,
  buildUserinfoHeader,
  profileTitleHeader
} from '../lib/traffic.js';

function parseMaybeJson(value) {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeInbound(inbound) {
  if (!inbound) return inbound;
  return {
    ...inbound,
    settings: parseMaybeJson(inbound.settings),
    streamSettings: parseMaybeJson(inbound.streamSettings),
    sniffing: parseMaybeJson(inbound.sniffing)
  };
}

/** VLESS id must be a UUID string, never a numeric DB row id */
function isUuid(v) {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.trim()
    )
  );
}

function extractUuid(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [obj.id, obj.uuid, obj.clientId, obj.client_id];
  for (const c of candidates) {
    if (isUuid(c)) return c.trim();
  }
  return null;
}

function findClient(inbound, email, clientFromApi) {
  // 1) Prefer API client if it has a real UUID
  const fromApi = extractUuid(clientFromApi);
  if (fromApi) {
    return {
      ...(clientFromApi || {}),
      id: fromApi,
      flow: clientFromApi?.flow || ''
    };
  }

  // 2) Search inbound settings.clients (source of truth for VLESS UUID)
  const list = inbound?.settings?.clients || [];
  const match = list.find(
    (x) =>
      x &&
      (x.email === email ||
        String(x.email || '').toLowerCase() === String(email).toLowerCase())
  );

  const fromSettings = extractUuid(match);
  if (fromSettings) {
    return {
      ...(match || {}),
      id: fromSettings,
      flow: match?.flow || ''
    };
  }

  // clientStats only has numeric traffic id — NEVER use it as VLESS UUID
  return null;
}

function buildVless(panel, inbound, client) {
  const ss = inbound.streamSettings || {};
  const rs = ss.realitySettings || {};
  const tcp = ss.tcpSettings || {};

  let address =
    panel.server ||
    inbound.shareAddr ||
    inbound.listen ||
    '';

  if (!address || address === '0.0.0.0' || address === '::') {
    address = panel.server || '';
  }

  const port = inbound.port;
  const uuid = client.id;

  if (!address || !port || !isUuid(uuid)) {
    throw new Error(
      `Incomplete VLESS data on ${panel.server || panel.name}: ` +
        `address=${address}, port=${port}, uuid=${uuid}`
    );
  }

  const q = new URLSearchParams();

  const network = ss.network || 'tcp';
  q.set('type', network);

  const flow = client.flow || '';
  if (flow) {
    q.set('flow', flow);
  }

  if (network === 'tcp') {
    q.set('headerType', tcp.header?.type || 'none');
  }

  if (network === 'ws') {
    const ws = ss.wsSettings || {};
    if (ws.path) q.set('path', ws.path);
    const host = ws.headers?.Host || ws.headers?.host;
    if (host) q.set('host', host);
  }

  if (network === 'grpc') {
    const grpc = ss.grpcSettings || {};
    if (grpc.serviceName) q.set('serviceName', grpc.serviceName);
  }

  const security = ss.security || 'none';
  q.set('security', security);

  if (security === 'reality') {
    const fingerprint =
      rs.settings?.fingerprint || rs.fingerprint || '';
    if (fingerprint) q.set('fp', fingerprint);

    const sni =
      (Array.isArray(rs.serverNames) && rs.serverNames[0]) ||
      rs.dest ||
      '';
    const sniHost = String(sni).split(':')[0];
    if (sniHost) q.set('sni', sniHost);

    const publicKey =
      rs.publicKey || rs.settings?.publicKey || '';
    if (publicKey) q.set('pbk', publicKey);

    const shortId =
      (Array.isArray(rs.shortIds) && rs.shortIds[0]) || '';
    if (shortId) q.set('sid', shortId);

    const spiderX =
      rs.settings?.spiderX ?? rs.settings?.spider ?? '';
    if (spiderX !== '' && spiderX != null) {
      q.set('spx', String(spiderX));
    }
  }

  if (security === 'tls') {
    const tls = ss.tlsSettings || {};
    const sni = tls.serverName || '';
    if (sni) q.set('sni', sni);
    const fp = tls.fingerprint || '';
    if (fp) q.set('fp', fp);
    const alpn = tls.alpn;
    if (Array.isArray(alpn) && alpn.length) {
      q.set('alpn', alpn.join(','));
    }
  }

  const remark =
    panel.name ||
    inbound.remark ||
    panel.server ||
    'server';

  const name = encodeURIComponent(remark);

  return `vless://${uuid}@${address}:${port}?${q.toString()}#${name}`;
}

export default async function handler(req, res) {
  try {
    let token = '';

    if (req.query?.token) {
      token = Array.isArray(req.query.token)
        ? req.query.token.join('.')
        : String(req.query.token);
    } else {
      const pathPart = (req.url || '')
        .split('?')[0]
        .split('/')
        .filter(Boolean)
        .pop();
      if (pathPart && pathPart !== 'sub') {
        token = pathPart;
      }
    }

    try {
      token = decodeURIComponent(String(token || '').trim());
    } catch {
      token = String(token || '').trim();
    }

    if (!token || token === 'sub') {
      throw new Error('Missing subscription token');
    }

    const email = readToken(token);
    const panels = getPanels();
    const output = [];
    const errors = [];

    console.log('Sub request for email:', email);

    for (const [key, panel] of Object.entries(panels)) {
      try {
        if (!panel?.url) {
          errors.push(`${key}: no panel url`);
          continue;
        }

        const [clientRaw, inboundRaw] = await Promise.all([
          getClient(panel, email).catch((e) => {
            console.error(`getClient ${key}:`, e.message);
            return null;
          }),
          getInbound(panel)
        ]);

        console.log(
          `Panel ${key} getClient id/uuid:`,
          clientRaw?.id,
          clientRaw?.uuid
        );

        const inbound = normalizeInbound(inboundRaw);
        const clientsInSettings = inbound?.settings?.clients || [];
        console.log(
          `Panel ${key} settings.clients count:`,
          clientsInSettings.length
        );

        const actualClient = findClient(inbound, email, clientRaw);

        if (!actualClient?.id) {
          errors.push(
            `${key}: no UUID for ${email}. ` +
              `apiId=${clientRaw?.id}, ` +
              `settingsClients=${clientsInSettings.length}`
          );
          continue;
        }

        const link = buildVless(panel, inbound, actualClient);
        console.log(`Built link for ${key}:`, link.slice(0, 100) + '...');
        output.push(link);
      } catch (err) {
        console.error(`sub panel ${key}:`, err);
        errors.push(`${key}: ${err.message || String(err)}`);
      }
    }

    if (!output.length) {
      throw new Error(
        'No server links built. ' +
          (errors.length ? errors.join(' | ') : 'Unknown error')
      );
    }

    // --- Same traffic source as Mini App (/api/me) ---
    let up = 0;
    let down = 0;
    let totalGb = 0;
    let expiryAt = null;
    let displayName = 'Destr Connect';
    try {
      await migrate();
      const sub = await getSubscriptionByEmail(email);
      if (sub) {
        totalGb = Number(sub.total_gb || 0);
        expiryAt = sub.expiry_at || null;
        displayName = sub.display_name || displayName;
      }
      const tr = await getTrafficForEmail(email);
      up = tr.up;
      down = tr.down;
    } catch (e) {
      console.warn('sub traffic', e.message);
    }

    const userinfo = buildUserinfoHeader({
      up,
      down,
      totalGb,
      expiryAt
    });
    const titleHdr = profileTitleHeader(displayName);

    const body = '#profile-title: ' + displayName + '\n' + output.join('\n');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('profile-title', titleHdr);
    res.setHeader('Profile-Title', titleHdr);
    res.setHeader('subscription-userinfo', userinfo);
    res.setHeader('Subscription-Userinfo', userinfo);
    res.setHeader('profile-update-interval', '12');
    res.setHeader('Profile-Update-Interval', '12');
    // CORS-ish exposure for some clients
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Subscription-Userinfo, Profile-Title, Profile-Update-Interval'
    );
    res.end(body);

    if (errors.length) {
      console.warn('sub partial errors:', errors);
    }
  } catch (e) {
    console.error('Subscription error:', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Subscription error: ' + (e.message || String(e)));
  }
}
