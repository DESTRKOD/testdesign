import crypto from "node:crypto";
const panels = {
  de: {
    url: process.env.DE_PANEL_URL,
    user: process.env.DE_PANEL_USER,
    pass: process.env.DE_PANEL_PASS,
    token: process.env.DE_API_TOKEN || '',
    inboundId: Number(process.env.DE_INBOUND_ID || 1),
    server: process.env.DE_SERVER,
    name: process.env.DE_SERVER_NAME
  },

  ru: {
    url: process.env.RU_PANEL_URL,
    user: process.env.RU_PANEL_USER,
    pass: process.env.RU_PANEL_PASS,
    token: process.env.RU_API_TOKEN || '',
    inboundId: Number(process.env.RU_INBOUND_ID || 1),
    server: process.env.RU_SERVER,
    name: process.env.RU_SERVER_NAME
  }
};

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

  if (hasApiToken(p)) {
    headers['Authorization'] = 'Bearer ' + String(p.token).trim();
  } else {
    const auth = await login(p);
    const token = await csrf(p, auth);
    headers['Cookie'] = auth.cookie;
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }

  const r = await fetch(base(p) + path, {
    ...opts,
    headers: {
      ...headers,
      ...(opts.headers || {})
    }
  });

  const j = await r.json().catch(() => ({}));

  if (!r.ok || j.success === false) {
    throw new Error((j.msg || r.status) + ' at ' + path);
  }

  return j;
}

/* ---------- Public API ---------- */

export async function createClient(p, email) {
  // Always generate UUID ourselves so we control it
  const uuid = crypto.randomUUID();

  // Try modern clients API first
  try {
    const j = await api(p, '/panel/api/clients/add', {
      method: 'POST',
      body: JSON.stringify({
        client: {
          id: uuid,
          email,
          enable: true,
          totalGB: 0,
          expiryTime: 0,
          tgId: 0,
          limitIp: 0,
          limitHwid: 0,
          flow: ''
        },
        inboundIds: [p.inboundId]
      })
    });
    console.log('createClient modern ok', p.server, email, uuid);
    return { ...j, uuid };
  } catch (modernErr) {
    console.warn('modern clients/add failed:', modernErr.message);
  }

  // Legacy: addClient on inbound
  const client = {
    id: uuid,
    email,
    flow: '',
    limitIp: 0,
    totalGB: 0,
    expiryTime: 0,
    enable: true,
    tgId: '',
    subId: ''
  };

  const j = await api(p, '/panel/api/inbounds/addClient', {
    method: 'POST',
    body: JSON.stringify({
      id: p.inboundId,
      settings: JSON.stringify({
        clients: [client]
      })
    })
  });

  console.log('createClient legacy ok', p.server, email, uuid);
  return { ...j, uuid };
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
