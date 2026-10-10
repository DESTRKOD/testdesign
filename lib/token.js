import crypto from 'node:crypto';

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    throw new Error('APP_SECRET must be at least 32 characters');
  }
  return s;
}

export function makeToken(email) {
  const payload = Buffer.from(JSON.stringify({ e: email })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');
  return payload + '.' + sig;
}

export function readToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) throw new Error('Invalid token');

  const expected = crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Invalid token');
  }

  const x = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!x.e) throw new Error('Invalid token');
  return x.e;
}
