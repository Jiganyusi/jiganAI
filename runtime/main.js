import {
  createRoom,
  getActiveRoom,
  getRoomById,
  listActiveRooms,
  setActiveRoom,
  updateRoomConversation,
} from "./room.js";
import { updateMemoryFromConversation } from "./memory.js";
import { callProvider } from "./provider.js";
import { buildBrainPrompt, buildBrainResponse } from "./brain.js";

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: "Start", callback_data: "ACTION_START" }],
    [{ text: "/topik", callback_data: "ACTION_TOPIK" }],
  ],
};

export async function handleTelegramUpdate(update, env) {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const text = (message.text || "").trim();

  if (!text) {
    await sendTelegramMessage(env.BOT_TOKEN, chatId, "Saya menerima pesan kosong, Mentor.", MAIN_MENU);
    return;
  }

  if (text === "/start" || text.toLowerCase() === "start") {
    await startNewRoom(chatId, env);
    return;
  }

  if (text === "/topik" || text.toLowerCase() === "topik") {
    await showTopics(chatId, env);
    return;
  }

  const room = getActiveRoom(chatId);

  if (!room) {
    await sendTelegramMessage(
      env.BOT_TOKEN,
      chatId,
      [
        "Mentor belum memilih Ruangan aktif.",
        "",
        "Silakan pilih:",
        "- Start untuk memulai topik baru.",
        "- /topik untuk memilih topik aktif yang sudah ada.",
      ].join("\n"),
      MAIN_MENU
    );
    return;
  }

  const reply = await processMentorMessage(chatId, room, text, env);
  await sendTelegramMessage(env.BOT_TOKEN, chatId, reply, MAIN_MENU);
}

async function handleCallback(callbackQuery, env) {
  const chatId = String(callbackQuery.message.chat.id);
  const data = callbackQuery.data || "";

  await answerCallbackQuery(env.BOT_TOKEN, callbackQuery.id);

  if (data === "ACTION_START") {
    await startNewRoom(chatId, env);
    return;
  }

  if (data === "ACTION_TOPIK") {
    await showTopics(chatId, env);
    return;
  }

  if (data.startsWith("ROOM:")) {
    const roomId = data.slice("ROOM:".length);
    const room = getRoomById(chatId, roomId);

    if (!room) {
      await sendTelegramMessage(env.BOT_TOKEN, chatId, "Topik tidak ditemukan, Mentor.", MAIN_MENU);
      return;
    }

    setActiveRoom(chatId, roomId);

    await sendTelegramMessage(
      env.BOT_TOKEN,
      chatId,
      [
        "Ruangan aktif dipilih.",
        "",
        `Nama Ruangan : ${room.nama}`,
        `Status       : ${room.status}`,
        `Topik        : ${room.topik}`,
        `Tanggal      : ${room.tanggal}`,
        "",
        "Silakan lanjutkan pembahasan di topik ini, Mentor.",
      ].join("\n"),
      MAIN_MENU
    );
  }
}

async function startNewRoom(chatId, env) {
  const room = createRoom(chatId);
  setActiveRoom(chatId, room.id);

  await sendTelegramMessage(
    env.BOT_TOKEN,
    chatId,
    [
      "Ruangan baru dibuat, Mentor.",
      "",
      `Nama Ruangan : ${room.nama}`,
      `Status       : ${room.status}`,
      `Topik        : ${room.topik}`,
      `Tanggal      : ${room.tanggal}`,
      "",
      "Kirim pesan pertama. Saya akan memakai pesan awal itu untuk memahami arah topik.",
    ].join("\n"),
    MAIN_MENU
  );
}

async function showTopics(chatId, env) {
  const rooms = listActiveRooms(chatId);

  if (!rooms.length) {
    await sendTelegramMessage(
      env.BOT_TOKEN,
      chatId,
      "Belum ada topik aktif, Mentor. Gunakan Start untuk membuat ruangan baru.",
      MAIN_MENU
    );
    return;
  }

  const keyboard = {
    inline_keyboard: rooms.map((room) => [
      {
        text: `${room.nama} — ${room.topik}`,
        callback_data: `ROOM:${room.id}`,
      },
    ]),
  };

  await sendTelegramMessage(env.BOT_TOKEN, chatId, "Pilih topik aktif, Mentor:", keyboard);
}

async function processMentorMessage(chatId, room, text, env) {
  updateRoomConversation(room, "Mentor", text);
  updateMemoryFromConversation(room, text);

  const systemPrompt = buildBrainPrompt(room);
  const providerResult = await callProvider(env, systemPrompt, text);
  const reply = buildBrainResponse(providerResult);

  updateRoomConversation(room, "Jiganyusi", reply);

  return reply;
}

async function sendTelegramMessage(botToken, chatId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body = {
    chat_id: chatId,
    text,
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function answerCallbackQuery(botToken, callbackQueryId) {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}
