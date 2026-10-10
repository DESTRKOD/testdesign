/**
 * Telegram Gateway API
 * https://core.telegram.org/gateway/api
 * Base: https://gatewayapi.telegram.org/
 */

const BASE = 'https://gatewayapi.telegram.org';

function token() {
  const t =
    process.env.TELEGRAM_GATEWAY_TOKEN ||
    process.env.GATEWAY_TOKEN ||
    process.env.TG_GATEWAY_TOKEN;
  if (!t) throw new Error('TELEGRAM_GATEWAY_TOKEN is not set');
  return t.trim();
}

async function gatewayPost(method, body) {
  const r = await fetch(`${BASE}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const j = await r.json().catch(() => ({}));

  if (!j.ok) {
    const err = j.error || j.description || `Gateway HTTP ${r.status}`;
    const e = new Error(String(err));
    e.gateway = j;
    throw e;
  }

  return j.result;
}

/** E.164: + and digits only */
export function toE164(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return '+' + digits;
}

/**
 * Optional pre-check (doesn't charge if you then pass request_id to send)
 */
export async function checkSendAbility(phoneNumber) {
  return gatewayPost('checkSendAbility', {
    phone_number: phoneNumber
  });
}

/**
 * Send OTP via Verification Codes chat.
 * Prefer code_length and let Telegram generate, then verify via checkVerificationStatus.
 * Or pass your own `code` (4–8 digits).
 */
export async function sendVerificationMessage({
  phoneNumber,
  code,
  codeLength = 6,
  ttl = 300,
  requestId,
  payload,
  callbackUrl
}) {
  const data = {
    phone_number: phoneNumber,
    ttl
  };

  if (requestId) data.request_id = requestId;
  if (payload) data.payload = String(payload).slice(0, 128);
  if (callbackUrl) data.callback_url = callbackUrl;

  if (code) {
    data.code = String(code).replace(/\D/g, '');
  } else {
    data.code_length = codeLength;
  }

  return gatewayPost('sendVerificationMessage', data);
}

/**
 * Verify user-entered code against Gateway request_id
 */
export async function checkVerificationStatus(requestId, code) {
  return gatewayPost('checkVerificationStatus', {
    request_id: requestId,
    code: String(code).replace(/\D/g, '')
  });
}

export async function revokeVerificationMessage(requestId) {
  return gatewayPost('revokeVerificationMessage', {
    request_id: requestId
  });
}
