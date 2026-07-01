import {
  createRoom,
  getActiveRoom,
  listActiveRooms,
  getRoomById,
  setActiveRoom,
  updateRoomConversation,
  archiveRoom,
  saveRoom,
} from "./room.js";
import { updateMemoryFromConversation } from "./memory.js";
import { callProvider, callFileProvider } from "./provider.js";
import { buildBrainPrompt, buildBrainResponse } from "./brain.js";

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: "Start", callback_data: "ACTION_START" }],
    [{ text: "/topik", callback_data: "ACTION_TOPIK" }],
  ],
};

const MAX_TELEGRAM_DOWNLOAD = 20 * 1024 * 1024;
const MAX_TEXT_FILE_CHARS = 120000;

export async function handleTelegramUpdate(update, env) {
  if (update.callback_query) return handleCallback(update.callback_query, env);

  const message = update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const text = (message.text || message.caption || "").trim();

  if (message.photo || message.document) {
    return handleFileMessage(chatId, message, text, env);
  }

  if (!text) {
    return sendTelegramMessage(env.BOT_TOKEN, chatId, "Saya menerima pesan kosong, Mentor.");
  }

  if (text === "/start" || text.toLowerCase() === "start") return startNewRoom(chatId, env);
  if (text === "/topik" || text.toLowerCase() === "topik") return showTopics(chatId, env);

  const room = await getActiveRoom(env, chatId);
  if (!room) {
    return sendTelegramMessage(env.BOT_TOKEN, chatId, "Mentor belum memilih Ruangan aktif.\n\nSilakan pilih salah satu tombol di bawah.", MAIN_MENU);
  }

  try {
    const reply = await processMentorMessage(chatId, room, text, env);
    await sendTelegramMessage(env.BOT_TOKEN, chatId, reply);
  } catch (err) {
    await sendTelegramMessage(env.BOT_TOKEN, chatId, `Terjadi kendala saat memproses pesan, Mentor.\n\nError: ${err.message || err}`);
  }
}

async function handleFileMessage(chatId, message, caption, env) {
  const room = await getActiveRoom(env, chatId);
  if (!room) {
    return sendTelegramMessage(env.BOT_TOKEN, chatId, "Mentor belum memilih Ruangan aktif.\n\nSilakan pilih salah satu tombol di bawah.", MAIN_MENU);
  }

  const fileMeta = getTelegramFileMeta(message);
  if (!fileMeta) {
    return sendTelegramMessage(env.BOT_TOKEN, chatId, "File belum didukung, Mentor.");
  }

  if (fileMeta.size && fileMeta.size > MAX_TELEGRAM_DOWNLOAD) {
    return sendTelegramMessage(env.BOT_TOKEN, chatId, "File terlalu besar, Mentor. Batas download Telegram Bot sekitar 20 MB.");
  }

  await sendTelegramMessage(env.BOT_TOKEN, chatId, "File saya terima. Saya baca dulu, Mentor.");

  try {
    const file = await downloadTelegramFile(env.BOT_TOKEN, fileMeta.fileId);
    const payload = await buildFilePayload(fileMeta, file.buffer, caption);

    const mentorNote = caption || `[mengirim ${fileMeta.kind}: ${fileMeta.name || fileMeta.mimeType}]`;
    updateRoomConversation(room, "Mentor", mentorNote);
    updateMemoryFromConversation(room, `Mentor mengirim ${fileMeta.kind}: ${fileMeta.name || fileMeta.mimeType}`);

    const systemPrompt = await buildBrainPrompt(room, caption || `Baca ${fileMeta.kind} ini.`, env);
    const result = await callFileProvider(env, systemPrompt, payload);
    const reply = buildBrainResponse(result);

    updateRoomConversation(room, "Jiganyusi", reply);
    await saveRoom(env, chatId, room);
    await sendTelegramMessage(env.BOT_TOKEN, chatId, reply);
  } catch (err) {
    await saveRoom(env, chatId, room);
    await sendTelegramMessage(env.BOT_TOKEN, chatId, `Gagal membaca file, Mentor.\n\nError: ${err.message || err}`);
  }
}

function getTelegramFileMeta(message) {
  if (message.photo?.length) {
    const p = message.photo[message.photo.length - 1];
    return { fileId: p.file_id, mimeType: "image/jpeg", kind: "image", name: "photo.jpg", size: p.file_size || 0 };
  }

  const d = message.document;
  if (!d) return null;

  const name = d.file_name || "file";
  const ext = getExt(name);
  const mime = d.mime_type || mimeFromExt(ext) || "application/octet-stream";
  const kind = kindFromMimeAndExt(mime, ext);

  if (!kind) return null;
  return { fileId: d.file_id, mimeType: normalizeMime(mime, ext), kind, name, size: d.file_size || 0, ext };
}

function getExt(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function mimeFromExt(ext) {
  const map = {
    txt: "text/plain",
    md: "text/markdown",
    js: "text/javascript",
    ts: "text/typescript",
    py: "text/x-python",
    json: "application/json",
    yml: "text/yaml",
    yaml: "text/yaml",
    html: "text/html",
    css: "text/css",
    csv: "text/csv",
    xml: "application/xml",
    sh: "text/x-shellscript",
    ps1: "text/plain",
    sql: "text/plain",
    env: "text/plain",
    log: "text/plain",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc: "application/msword",
    xls: "application/vnd.ms-excel",
    ppt: "application/vnd.ms-powerpoint",
    rtf: "application/rtf",
  };
  return map[ext] || "";
}

function normalizeMime(mime, ext) {
  return mime && mime !== "application/octet-stream" ? mime : (mimeFromExt(ext) || "application/octet-stream");
}

function kindFromMimeAndExt(mime, ext) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (m === "application/pdf" || ext === "pdf") return "document";
  if (m.startsWith("text/") || ["txt", "md", "js", "ts", "py", "json", "yml", "yaml", "html", "css", "csv", "xml", "sh", "ps1", "sql", "env", "log"].includes(ext)) return "text";
  if (["docx", "xlsx", "pptx", "doc", "xls", "ppt", "rtf", "odt", "ods", "odp"].includes(ext)) return "document";
  if (m.includes("word") || m.includes("excel") || m.includes("powerpoint") || m.includes("spreadsheet") || m.includes("presentation")) return "document";
  return null;
}

async function buildFilePayload(fileMeta, buffer, caption) {
  if (fileMeta.kind === "text") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer).slice(0, MAX_TEXT_FILE_CHARS);
    return {
      kind: "text",
      mimeType: fileMeta.mimeType,
      filename: fileMeta.name,
      text,
      caption,
    };
  }

  return {
    kind: fileMeta.kind,
    mimeType: fileMeta.mimeType,
    filename: fileMeta.name,
    base64: arrayBufferToBase64(buffer),
    caption,
  };
}

async function downloadTelegramFile(botToken, fileId) {
  const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const info = await infoRes.json().catch(() => null);
  if (!infoRes.ok || !info?.ok) throw new Error(info?.description || "Telegram getFile gagal");

  const filePath = info.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!fileRes.ok) throw new Error(`Telegram download gagal ${fileRes.status}`);
  return { buffer: await fileRes.arrayBuffer(), path: filePath };
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function handleCallback(callbackQuery, env) {
  const chatId = String(callbackQuery.message.chat.id);
  const data = callbackQuery.data || "";
  await answerCallbackQuery(env.BOT_TOKEN, callbackQuery.id);

  if (data === "ACTION_START") return startNewRoom(chatId, env);
  if (data === "ACTION_TOPIK") return showTopics(chatId, env);

  if (data.startsWith("ROOM:")) {
    const roomId = data.slice("ROOM:".length);
    const room = await getRoomById(env, chatId, roomId);
    if (!room) return sendTelegramMessage(env.BOT_TOKEN, chatId, "Topik tidak ditemukan, Mentor.");

    await setActiveRoom(env, chatId, roomId);
    return sendTelegramMessage(env.BOT_TOKEN, chatId, [
      "Ruangan aktif dipilih.",
      "",
      `Nama Ruangan : ${room.nama}`,
      `Status       : ${room.status}`,
      `Topik        : ${room.topik}`,
      `Tanggal      : ${room.tanggal}`,
      "",
      "Silakan lanjutkan pembahasan di topik ini, Mentor.",
    ].join("\n"));
  }

  if (data.startsWith("ARCHIVE:")) {
    const roomId = data.slice("ARCHIVE:".length);
    const room = await archiveRoom(env, chatId, roomId);
    if (!room) return sendTelegramMessage(env.BOT_TOKEN, chatId, "Topik tidak ditemukan, Mentor.");
    return sendTelegramMessage(env.BOT_TOKEN, chatId, `Topik sudah diarsipkan, Mentor.\n\nNama Ruangan : ${room.nama}\nTopik        : ${room.topik}\n\nPengetahuannya tetap disimpan sebagai arsip.`);
  }
}

async function startNewRoom(chatId, env) {
  const room = await createRoom(env, chatId);
  await setActiveRoom(env, chatId, room.id);
  await sendTelegramMessage(env.BOT_TOKEN, chatId, [
    "Ruangan baru dibuat, Mentor.",
    "",
    `Nama Ruangan : ${room.nama}`,
    `Status       : ${room.status}`,
    `Topik        : ${room.topik}`,
    `Tanggal      : ${room.tanggal}`,
    "",
    "Kirim pesan pertama.",
    "Saya akan memakai pesan awal itu untuk memahami arah topik.",
  ].join("\n"));
}

async function showTopics(chatId, env) {
  const rooms = await listActiveRooms(env, chatId);
  if (!rooms.length) {
    return sendTelegramMessage(env.BOT_TOKEN, chatId, "Belum ada topik aktif, Mentor.\nGunakan Start untuk membuat ruangan baru.", MAIN_MENU);
  }

  const keyboard = {
    inline_keyboard: rooms.flatMap((room) => [
      [{ text: `Buka: ${room.nama} — ${room.topik}`, callback_data: `ROOM:${room.id}` }],
      [{ text: `Arsipkan: ${room.nama}`, callback_data: `ARCHIVE:${room.id}` }],
    ]),
  };

  await sendTelegramMessage(env.BOT_TOKEN, chatId, "Pilih topik aktif, Mentor:", keyboard);
}

async function processMentorMessage(chatId, room, text, env) {
  updateRoomConversation(room, "Mentor", text);
  updateMemoryFromConversation(room, text);
  const systemPrompt = await buildBrainPrompt(room, text, env);
  const providerResult = await callProvider(env, systemPrompt, text);
  const reply = buildBrainResponse(providerResult);
  updateRoomConversation(room, "Jiganyusi", reply);
  await saveRoom(env, chatId, room);
  return reply;
}

async function sendTelegramMessage(botToken, chatId, text, replyMarkup = null) {
  const chunks = splitTelegramText(String(text || ""));
  for (const chunk of chunks) {
    const body = { chat_id: chatId, text: chunk };
    if (replyMarkup && chunk === chunks[0]) body.reply_markup = replyMarkup;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

function splitTelegramText(text) {
  const max = 3900;
  if (text.length <= max) return [text || " "];
  const chunks = [];
  for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
  return chunks;
}

async function answerCallbackQuery(botToken, callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}
