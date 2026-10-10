# Destr VPN — Logic layer

## Env (Vercel)

```
# App
APP_SECRET=минимум_32_случайных_символа
ADMIN_API_KEY=секрет_для_?admin=
ADMIN_TG_ID=2112942356

# Telegram
BOT_TOKEN=123:ABC...

# Turso
TURSO_DATABASE_URL=libsql://xxx.turso.io
TURSO_AUTH_TOKEN=...

# 3x-ui (already used)
DE_PANEL_URL=
DE_API_TOKEN=
DE_INBOUND_ID=1
DE_SERVER=
DE_SERVER_NAME=

RU_PANEL_URL=
RU_API_TOKEN=
RU_INBOUND_ID=1
RU_SERVER=
RU_SERVER_NAME=

# Dev only: return code in API response
AUTH_DEV_EXPOSE_CODE=1
```

## Auth API

| Method | Path | Body | Result |
|--------|------|------|--------|
| POST | `/api/auth/send-code` | `{ phone }` | sends code |
| POST | `/api/auth/verify-code` | `{ phone, code }` | `{ token, need2fa, user }` |
| POST | `/api/auth/telegram` | `{ initData }` | `{ token, user }` |
| POST | `/api/auth/logout` | `{ token }` or Bearer | ok |
| GET/POST | `/api/me` | Bearer token | user + subscription |

## Session

Client stores `token` in `localStorage` and sends:

```
Authorization: Bearer <token>
```

## Next steps

1. Turso DB create + env
2. Wire frontend login to these endpoints
3. Admin API: create / edit / block subscription + 3x-ui
4. Device add + traffic from 3x-ui
5. Bot notifications
