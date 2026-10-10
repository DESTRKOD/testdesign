/**
 * Our Telegram bot — codes for returning users, notifications
 */

function botToken() {
  const t = process.env.BOT_TOKEN;
  if (!t) throw new Error('BOT_TOKEN is not set');
  return t.trim();
}

export async function sendBotMessage(chatId, text, opts = {}) {
  const r = await fetch(
    `https://api.telegram.org/bot${botToken()}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts.parse_mode || 'HTML',
        disable_web_page_preview: true
      })
    }
  );

  const j = await r.json().catch(() => ({}));
  if (!j.ok) {
    throw new Error(j.description || 'Bot sendMessage failed');
  }
  return j.result;
}

export async function sendLoginCodeToUser(tgId, code) {
  const text =
    `<b>Код входа Destr VPN</b>\n\n` +
    `<code>${code}</code>\n\n` +
    `Действует 5 минут. Никому не сообщайте код.`;
  return sendBotMessage(tgId, text);
}
