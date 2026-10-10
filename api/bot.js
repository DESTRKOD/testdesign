/**
 * Telegram bot webhook: /start → welcome + Mini App button
 * Set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR_DOMAIN/api/bot
 */
function botToken() {
  const t = process.env.BOT_TOKEN;
  if (!t) throw new Error('BOT_TOKEN is not set');
  return t.trim();
}

function appUrl() {
  return (
    process.env.MINI_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    ''
  );
}

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json().catch(() => ({}));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'destr-bot-webhook' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  try {
    const update =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg?.chat?.id) {
      return res.status(200).json({ ok: true });
    }

    const text = String(msg.text || '').trim();
    if (text === '/start' || text.startsWith('/start ')) {
      const url = String(appUrl() || '').replace(/\/$/, '');
      if (!url) {
        await tg('sendMessage', {
          chat_id: msg.chat.id,
          text: 'Добро пожаловать в Destr Connect.\n\nURL мини-приложения не настроен (MINI_APP_URL).'
        });
        return res.status(200).json({ ok: true });
      }

      await tg('sendMessage', {
        chat_id: msg.chat.id,
        text:
          'Добро пожаловать в Destr Connect\n\nЧтобы попасть в личный кабинет, нажмите кнопку ниже:',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Открыть приложение',
                web_app: { url }
              }
            ]
          ]
        }
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('bot webhook', e);
    return res.status(200).json({ ok: true });
  }
}
