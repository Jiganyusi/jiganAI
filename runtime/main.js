import { createRoom, getActiveRoom, listActiveRooms, getRoomById, setActiveRoom, updateRoomConversation, archiveRoom, saveRoom } from "./room.js";
import { updateMemoryFromConversation } from "./memory.js";
import { callProvider, callFileProvider } from "./provider.js";
import { buildBrainPrompt, buildBrainResponse } from "./brain.js";

const MAIN_MENU = { inline_keyboard: [[{ text: "Start", callback_data: "ACTION_START" }], [{ text: "/topik", callback_data: "ACTION_TOPIK" }]] };
const MAX_TELEGRAM_DOWNLOAD = 20 * 1024 * 1024;

export async function handleTelegramUpdate(update, env) {
  if (update.callback_query) return handleCallback(update.callback_query, env);
  const message = update.message; if (!message) return;
  const chatId = String(message.chat.id);
  const text = (message.text || message.caption || "").trim();
  if (message.photo || message.document) return handleFileMessage(chatId, message, text, env);
  if (!text) return sendTelegramMessage(env.BOT_TOKEN, chatId, "Saya menerima pesan kosong, Mentor.");
  if (text === "/start" || text.toLowerCase() === "start") return startNewRoom(chatId, env);
  if (text === "/topik" || text.toLowerCase() === "topik") return showTopics(chatId, env);
  const room = await getActiveRoom(env, chatId);
  if (!room) return sendTelegramMessage(env.BOT_TOKEN, chatId, "Mentor belum memilih Ruangan aktif.\n\nSilakan pilih salah satu tombol di bawah.", MAIN_MENU);
  try {
    const reply = await processMentorMessage(chatId, room, text, env);
    await sendTelegramMessage(env.BOT_TOKEN, chatId, reply);
  } catch (err) {
    await sendTelegramMessage(env.BOT_TOKEN, chatId, `Terjadi kendala saat memproses pesan, Mentor.\n\nError: ${err.message || err}`);
  }
}

async function handleFileMessage(chatId, message, caption, env) {
  const room = await getActiveRoom(env, chatId);
  if (!room) return sendTelegramMessage(env.BOT_TOKEN, chatId, "Mentor belum memilih Ruangan aktif.\n\nSilakan pilih salah satu tombol di bawah.", MAIN_MENU);
  const fileMeta = getTelegramFileMeta(message);
  if (!fileMeta) return sendTelegramMessage(env.BOT_TOKEN, chatId, "File belum didukung, Mentor. Kirim JPG, PNG, atau PDF.");
  if (fileMeta.size && fileMeta.size > MAX_TELEGRAM_DOWNLOAD) return sendTelegramMessage(env.BOT_TOKEN, chatId, "File terlalu besar, Mentor. Batas download Telegram Bot sekitar 20 MB.");
  await sendTelegramMessage(env.BOT_TOKEN, chatId, "File saya terima. Saya baca dulu, Mentor.");
  try {
    const file = await downloadTelegramFile(env.BOT_TOKEN, fileMeta.fileId);
    const base64 = arrayBufferToBase64(file.buffer);
    updateRoomConversation(room, "Mentor", caption || `[mengirim ${fileMeta.kind}: ${fileMeta.name || fileMeta.mimeType}]`);
    updateMemoryFromConversation(room, caption || `Mentor mengirim ${fileMeta.kind}`);
    const systemPrompt = await buildBrainPrompt(room, caption || `Baca ${fileMeta.kind} ini.`, env);
    const result = await callFileProvider(env, systemPrompt, { kind: fileMeta.kind, mimeType: fileMeta.mimeType, base64, caption });
    const reply = buildBrainResponse(result);
    updateRoomConversation(room, "Jiganyusi", reply);
    await saveRoom(env, chatId, room);
    await sendTelegramMessage(env.BOT_TOKEN, chatId, reply);
  } catch (err) {
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
  const mime = d.mime_type || "";
  const name = d.file_name || "file";
  if (mime === "image/jpeg" || mime === "image/png") return { fileId: d.file_id, mimeType: mime, kind: "image", name, size: d.file_size || 0 };
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return { fileId: d.file_id, mimeType: "application/pdf", kind: "pdf", name, size: d.file_size || 0 };
  return null;
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
function arrayBufferToBase64(buffer) { let binary = ""; const bytes = new Uint8Array(buffer); for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]); return btoa(binary); }

async function handleCallback(callbackQuery, env) {
  const chatId = String(callbackQuery.message.chat.id); const data = callbackQuery.data || "";
  await answerCallbackQuery(env.BOT_TOKEN, callbackQuery.id);
  if (data === "ACTION_START") return startNewRoom(chatId, env);
  if (data === "ACTION_TOPIK") return showTopics(chatId, env);
  if (data.startsWith("ROOM:")) {
    const roomId = data.slice(5); const room = await getRoomById(env, chatId, roomId);
    if (!room) return sendTelegramMessage(env.BOT_TOKEN, chatId, "Topik tidak ditemukan, Mentor.");
    await setActiveRoom(env, chatId, roomId);
    return sendTelegramMessage(env.BOT_TOKEN, chatId, [`Ruangan aktif dipilih.`, ``, `Nama Ruangan : ${room.nama}`, `Status       : ${room.status}`, `Topik        : ${room.topik}`, `Tanggal      : ${room.tanggal}`, ``, `Silakan lanjutkan pembahasan di topik ini, Mentor.`].join("\n"));
  }
  if (data.startsWith("ARCHIVE:")) {
    const roomId = data.slice(8); const room = await archiveRoom(env, chatId, roomId);
    if (!room) return sendTelegramMessage(env.BOT_TOKEN, chatId, "Topik tidak ditemukan, Mentor.");
    return sendTelegramMessage(env.BOT_TOKEN, chatId, `Topik sudah diarsipkan, Mentor.\n\nNama Ruangan : ${room.nama}\nTopik        : ${room.topik}\n\nPengetahuannya tetap disimpan sebagai arsip.`);
  }
}

async function startNewRoom(chatId, env) { const room = await createRoom(env, chatId); await setActiveRoom(env, chatId, room.id); await sendTelegramMessage(env.BOT_TOKEN, chatId, [`Ruangan baru dibuat, Mentor.`, ``, `Nama Ruangan : ${room.nama}`, `Status       : ${room.status}`, `Topik        : ${room.topik}`, `Tanggal      : ${room.tanggal}`, ``, `Kirim pesan pertama.`, `Saya akan memakai pesan awal itu untuk memahami arah topik.`].join("\n")); }
async function showTopics(chatId, env) { const rooms = await listActiveRooms(env, chatId); if (!rooms.length) return sendTelegramMessage(env.BOT_TOKEN, chatId, "Belum ada topik aktif, Mentor.\nGunakan Start untuk membuat ruangan baru.", MAIN_MENU); const keyboard = { inline_keyboard: rooms.flatMap(room => [[{ text: `Buka: ${room.nama} — ${room.topik}`, callback_data: `ROOM:${room.id}` }], [{ text: `Arsipkan: ${room.nama}`, callback_data: `ARCHIVE:${room.id}` }]]) }; await sendTelegramMessage(env.BOT_TOKEN, chatId, "Pilih topik aktif, Mentor:", keyboard); }
async function processMentorMessage(chatId, room, text, env) { updateRoomConversation(room, "Mentor", text); updateMemoryFromConversation(room, text); const systemPrompt = await buildBrainPrompt(room, text, env); const providerResult = await callProvider(env, systemPrompt, text); const reply = buildBrainResponse(providerResult); updateRoomConversation(room, "Jiganyusi", reply); await saveRoom(env, chatId, room); return reply; }
async function sendTelegramMessage(botToken, chatId, text, replyMarkup = null) { const body = { chat_id: chatId, text }; if (replyMarkup) body.reply_markup = replyMarkup; await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function answerCallbackQuery(botToken, callbackQueryId) { await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: callbackQueryId }) }); }
