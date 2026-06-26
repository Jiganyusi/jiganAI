const CHAT_STATE = new Map();

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getChatState(chatId) {
  if (!CHAT_STATE.has(chatId)) {
    CHAT_STATE.set(chatId, {
      rooms: [],
      activeRoomId: null,
      counter: 0,
    });
  }

  return CHAT_STATE.get(chatId);
}

export function createRoom(chatId) {
  const state = getChatState(chatId);
  state.counter += 1;

  const room = {
    id: `room-${state.counter}`,
    nama: `Room-${String(state.counter).padStart(3, "0")}`,
    status: "Aktif",
    topik: "Topik baru",
    tanggal: getToday(),
    percakapan: [],
    ingatan: {
      topik: "Topik baru",
      pengetahuan: "Belum ada pengetahuan tetap.",
      status: "Aktif",
      tanggal: getToday(),
    },
  };

  state.rooms.push(room);
  return room;
}

export function listActiveRooms(chatId) {
  const state = getChatState(chatId);
  return state.rooms.filter((room) => room.status === "Aktif");
}

export function getRoomById(chatId, roomId) {
  const state = getChatState(chatId);
  return state.rooms.find((room) => room.id === roomId) || null;
}

export function setActiveRoom(chatId, roomId) {
  const state = getChatState(chatId);
  state.activeRoomId = roomId;
}

export function getActiveRoom(chatId) {
  const state = getChatState(chatId);

  if (!state.activeRoomId) return null;

  return getRoomById(chatId, state.activeRoomId);
}

export function updateRoomConversation(room, role, text) {
  if (room.topik === "Topik baru" && role === "Mentor") {
    room.topik = inferTopic(text);
    room.ingatan.topik = room.topik;
  }

  room.percakapan.push({ role, text });
  room.percakapan = room.percakapan.slice(-10);
}

function inferTopic(text) {
  const clean = text.replace(/\s+/g, " ").trim();

  if (!clean) return "Topik baru";

  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}
