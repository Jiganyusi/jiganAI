import { handleTelegramUpdate } from "./runtime/main.js";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Jiganyusi Worker aktif.", { status: 200 });
    }

    const update = await request.json().catch(() => null);
    if (!update) return new Response("OK", { status: 200 });

    try {
      const chatId = getChatId(update);

      if (chatId && env.ADMIN_CHAT_ID && String(chatId) !== String(env.ADMIN_CHAT_ID)) {
        await alertAdmin(env, chatId, update);
        return new Response("OK", { status: 200 });
      }

      await handleTelegramUpdate(update, env);
    } catch (err) {
      await notifyError(env, err);
    }

    return new Response("OK", { status: 200 });
  },
};

function getChatId(update) {
  return (
    update?.message?.chat?.id ||
    update?.callback_query?.message?.chat?.id ||
    update?.callback_query?.from?.id ||
    null
  );
}

async function alertAdmin(env, intruderChatId, update) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return;

  const username = update?.message?.from?.username || update?.callback_query?.from?.username || "-";
  const text = update?.message?.text || update?.callback_query?.data || "-";

  await sendTelegramMessage(
    env.BOT_TOKEN,
    env.ADMIN_CHAT_ID,
    [
      "⚠️ Akses tidak dikenal terdeteksi.",
      "",
      `Chat ID : ${intruderChatId}`,
      `Username: ${username}`,
      `Input   : ${text}`,
      "",
      "Pesan dari user tersebut dibungkam.",
    ].join("\n")
  );
}

async function notifyError(env, err) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return;

  await sendTelegramMessage(
    env.BOT_TOKEN,
    env.ADMIN_CHAT_ID,
    [
      "⚠️ Runtime Jiganyusi error.",
      "",
      String(err?.stack || err?.message || err).slice(0, 3500),
    ].join("\n")
  );
}

async function sendTelegramMessage(botToken, chatId, text) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
