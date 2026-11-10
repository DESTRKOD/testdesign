import crypto from "node:crypto";
function envPanel(prefix, defaults = {}) {
  const url =
    process.env[prefix + '_PANEL_URL'] ||
    process.env[prefix + '_URL'] ||
    '';
  if (!url) return null;
  return {
    key: prefix.toLowerCase(),
    url,
    user: process.env[prefix + '_PANEL_USER'] || '',
    pass: process.env[prefix + '_PANEL_PASS'] || '',
    token:
      process.env[prefix + '_API_TOKEN'] ||
      process.env[prefix + '_PANEL_TOKEN'] ||
      process.env[prefix + '_TOKEN'] ||
      '',
    inboundId: Number(process.env[prefix + '_INBOUND_ID'] || 1),
    server: process.env[prefix + '_SERVER'] || '',
    name:
      process.env[prefix + '_SERVER_NAME'] ||
      defaults.label ||
      prefix.toLowerCase(),
    label:
      process.env[prefix + '_LABEL'] ||
      defaults.label ||
      prefix.toUpperCase()
  };
}

/** DE / RU / FI — third (or more) server: set FI_PANEL_URL + FI_API_TOKEN + FI_INBOUND_ID + FI_SERVER */
const panels = {};
for (const [prefix, defaults] of [
  ['DE', { label: 'Германия' }],
  ['RU', { label: 'Россия' }],
  ['FI', { label: 'Финляндия' }],
  ['NL', { label: 'Нидерланды' }],
  ['US', { label: 'США' }]
]) {
  const p = envPanel(prefix, defaults);
  if (p) panels[p.key] = p;
}

function base(p) {
  return String(p.url || '').replace(/\/$/, '');
}

function hasApiToken(p) {
  return Boolean(p.token && String(p.token).trim());
}

function isUuid(v) {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.trim()
    )
  );
}

/* ---------- Cookie login (fallback only) ---------- */

async function login(p) {
  const url = base(p) + '/login';

  let r = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: JSON.stringify({
      username: p.user,
      password: p.pass
    })
  });

  let body = await r.text();

  if (!r.ok || !r.headers.get('set-cookie')) {
    r = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: new URLSearchParams({
        username: p.user,
        password: p.pass
      }).toString()
    });
    body = await r.text();
  }

  console.log('3x-ui login diagnostic', {
    url,
    status: r.status,
    body: body.slice(0, 300),
    hasCookie: !!r.headers.get('set-cookie')
  });

  if (!r.ok) {
    throw new Error(
      '3x-ui login failed: HTTP ' +
        r.status +
        '; response=' +
        body.slice(0, 200)
    );
  }

  const cookie = (r.headers.get('set-cookie') || '')
    .split(',')
    .map((x) => x.trim().split(';')[0])
    .filter(Boolean)
    .join('; ');

  if (!cookie) {
    throw new Error('3x-ui login returned no session cookie');
  }

  return { cookie };
}

async function csrf(p, auth) {
  const r = await fetch(base(p) + '/csrf-token', {
    headers: {
      Cookie: auth.cookie
    }
  });

  const j = await r.json().catch(() => ({}));
  return j.obj || j.token || '';
}

/* ---------- Unified request helper ---------- */

async function api(p, path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  const panelLabel = p.name || p.server || base(p) || 'panel';

  if (hasApiToken(p)) {
    headers['Authorization'] = 'Bearer ' + String(p.token).trim();
  } else if (p.user && p.pass) {
    // Cookie login often returns 403 on modern 3x-ui — only as last resort
    console.warn(
      '[3x-ui] No API token for',
      panelLabel,
      '— falling back to /login (often 403). Set DE_API_TOKEN / RU_API_TOKEN'
    );
    const auth = await login(p);
    const token = await csrf(p, auth);
    headers['Cookie'] = auth.cookie;
    if (token) headers['X-CSRF-Token'] = token;
  } else {
    throw new Error(
      'Нет DE_API_TOKEN/RU_API_TOKEN для панели ' +
        panelLabel +
        '. В 3x-ui: Settings → Security → API Token. В Vercel env добавь токен.'
    );
  }

  const url = base(p) + path;
  const r = await fetch(url, {
    ...opts,
    headers: {
      ...headers,
      ...(opts.headers || {})
    }
  });

  const raw = await r.text();
  let j = {};
  try {
    j = raw ? JSON.parse(raw) : {};
  } catch {
    j = { msg: raw.slice(0, 200) };
  }

  if (!r.ok || j.success === false) {
    throw new Error(
      (j.msg || j.error || ('HTTP ' + r.status)) + ' at ' + path
    );
  }

  return j;
}

/* ---------- Public API ---------- */

/**
 * Create client on panel.
 * `email` is what 3x-ui shows as the client name — pass a human-readable unique label.
 * opts: { totalGB, expiryTime, enable, remark }
 */
export async function createClient(p, email, opts = {}) {
  const uuid = crypto.randomUUID();
  const totalGB = opts.totalGB != null ? Number(opts.totalGB) : 0;
  const expiryTime = opts.expiryTime != null ? Number(opts.expiryTime) : 0;
  const enable = opts.enable != null ? Boolean(opts.enable) : true;
  const remark = String(opts.remark || email).slice(0, 64);
  // sanitize email for panel (unique key)
  const safeEmail = String(email)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[·•]/g, '_')
    .slice(0, 64);

  const clientObj = {
    id: uuid,
    email: safeEmail,
    comment: remark,
    enable,
    totalGB,
    expiryTime,
    tgId: '',
    limitIp: 0,
    limitHwid: 0,
    flow: '',
    subId: crypto.randomBytes(8).toString('hex')
  };

  const attempts = [
    // modern clients API
    {
      path: '/panel/api/clients/add',
      body: {
        client: clientObj,
        inboundIds: [Number(p.inboundId)]
      }
    },
    {
      path: '/panel/api/clients/add',
      body: {
        ...clientObj,
        inboundIds: [Number(p.inboundId)]
      }
    },
    // classic addClient on inbound
    {
      path: '/panel/api/inbounds/addClient',
      body: {
        id: Number(p.inboundId),
        settings: JSON.stringify({ clients: [clientObj] })
      }
    }
  ];

  const errors = [];
  for (const a of attempts) {
    try {
      const j = await api(p, a.path, {
        method: 'POST',
        body: JSON.stringify(a.body)
      });
      console.log('createClient ok', p.key || p.name, a.path, safeEmail, uuid);
      return { ...j, uuid, email: safeEmail };
    } catch (e) {
      errors.push(a.path + ': ' + (e.message || e));
      console.warn('createClient try failed', a.path, e.message);
    }
  }

  throw new Error(
    'createClient failed on ' +
      (p.label || p.key || p.server || '?') +
      ': ' +
      errors.join(' | ')
  );
}

export async function getClient(p, email) {
  // Try dedicated clients endpoint
  try {
    const j = await api(
      p,
      '/panel/api/clients/get/' + encodeURIComponent(email)
    );

    const obj = j.obj?.client || j.obj || j;
    // Normalize: ensure we surface UUID if present under alternate keys
    if (obj && !isUuid(obj.id) && isUuid(obj.uuid)) {
      obj.id = obj.uuid;
    }
    return obj;
  } catch (e) {
    console.warn('clients/get failed:', e.message);
  }

  // Fallback: pull from inbound settings
  const inbound = await getInbound(p);
  let settings = inbound?.settings;
  if (typeof settings === 'string') {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = {};
    }
  }
  const list = settings?.clients || [];
  const found = list.find(
    (c) =>
      c?.email === email ||
      String(c?.email || '').toLowerCase() === String(email).toLowerCase()
  );
  return found || null;
}

export async function getInbound(p) {
  const j = await api(p, '/panel/api/inbounds/get/' + p.inboundId);
  return j.obj;
}

export function getPanels() {
  return panels;
}

/** Enable/disable client by email on inbound */
export async function setClientEnable(p, email, enable) {
  // Try modern clients update
  try {
    return await api(p, '/panel/api/clients/update', {
      method: 'POST',
      body: JSON.stringify({
        email,
        enable: Boolean(enable)
      })
    });
  } catch (_) {}

  const inbound = await getInbound(p);
  let settings = inbound?.settings;
  if (typeof settings === 'string') {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = {};
    }
  }
  const clients = settings?.clients || [];
  const idx = clients.findIndex((c) => c.email === email);
  if (idx < 0) throw new Error('Client not found: ' + email);
  clients[idx].enable = Boolean(enable);

  return api(p, '/panel/api/inbounds/updateClient', {
    method: 'POST',
    body: JSON.stringify({
      id: p.inboundId,
      settings: JSON.stringify({ clients: [clients[idx]] })
    })
  });
}

/**
 * Update traffic / expiry on panels.
 * totalGB: 0 = unlimited; expiryTime: ms timestamp or 0 = never
 */
export async function updateClientLimits(p, email, { totalGB, expiryTime, enable }) {
  try {
    const body = { email };
    if (totalGB != null) body.totalGB = Number(totalGB);
    if (expiryTime != null) body.expiryTime = Number(expiryTime);
    if (enable != null) body.enable = Boolean(enable);
    return await api(p, '/panel/api/clients/update', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  } catch (_) {}

  const inbound = await getInbound(p);
  let settings = inbound?.settings;
  if (typeof settings === 'string') {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = {};
    }
  }
  const clients = settings?.clients || [];
  const idx = clients.findIndex((c) => c.email === email);
  if (idx < 0) throw new Error('Client not found: ' + email);
  if (totalGB != null) clients[idx].totalGB = Number(totalGB);
  if (expiryTime != null) clients[idx].expiryTime = Number(expiryTime);
  if (enable != null) clients[idx].enable = Boolean(enable);

  return api(p, '/panel/api/inbounds/updateClient', {
    method: 'POST',
    body: JSON.stringify({
      id: p.inboundId,
      settings: JSON.stringify({ clients: [clients[idx]] })
    })
  });
}

/** Traffic from clientStats on inbound */
export async function getClientTraffic(p, email) {
  const inbound = await getInbound(p);
  const stats = inbound?.clientStats || [];
  const row = stats.find((c) => c.email === email);
  if (!row) return { up: 0, down: 0, total: 0 };
  const up = Number(row.up || 0);
  const down = Number(row.down || 0);
  return { up, down, total: up + down };
}


/** Quick health: can we reach inbound via API (timeout 4s) */
export async function checkPanelHealth(p) {
  if (!p?.url) return { ok: false, error: 'no url' };
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    // Prefer token API light call — get inbound
    await getInbound(p);
    clearTimeout(timer);
    return { ok: true, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e.message || String(e), ms: Date.now() - start };
  }
}

export async function checkAllPanelsHealth() {
  const list = Object.values(getPanels()).filter((p) => p?.url);
  const results = await Promise.all(
    list.map(async (p) => {
      const h = await checkPanelHealth(p);
      return {
        key: p.key || p.name,
        label: p.label || p.name || p.key,
        ...h
      };
    })
  );
  return results;
}
