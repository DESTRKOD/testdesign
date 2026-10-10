# Destr VPN — working core

## Env
```
APP_SECRET=
ADMIN_API_KEY=
ADMIN_TG_ID=2112942356
ADMIN_ALLOW_KEY_ONLY=1

BOT_TOKEN=
TELEGRAM_GATEWAY_TOKEN=

TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

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
```

`ADMIN_ALLOW_KEY_ONLY=1` — временно для curl без Telegram (потом выключить).

## Admin API
`POST /api/admin/subscription`
Header: `x-admin-key: ADMIN_API_KEY`

```json
{ "action": "create", "userId": 1, "name": "Иван", "totalGb": 100, "days": 30, "deviceLimit": 3 }
{ "action": "edit", "userId": 1, "totalGb": 200, "days": 60 }
{ "action": "block", "userId": 1 }
{ "action": "unblock", "userId": 1 }
{ "action": "get", "userId": 1 }
```

`GET/POST /api/admin/users` — список / поиск

## User
`POST /api/device/add` — Bearer session → subscription URL  
`GET /api/sub?token=` — VLESS links  
`GET /api/me` — кабинет
