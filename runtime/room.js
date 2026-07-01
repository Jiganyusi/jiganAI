const MEMORY_STORE = new Map();

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function emptyState() {
  return { activeRoomId: null, rooms: [] };
}

function stateKey(chatId) {
  return `rooms:${chatId}`;
}

async function loadState(env, chatId) {
  if (env?.ROOM_KV) {
    const saved = await env.ROOM_KV.get(stateKey(chatId), "json").catch(() => null);
    if (saved && Array.isArray(saved.rooms)) {
      return { activeRoomId: saved.activeRoomId || null, rooms: saved.rooms.map(normalizeRoom) };
    }
    return emptyState();
  }

  if (!MEMORY_STORE.has(chatId)) MEMORY_STORE.set(chatId, emptyState());
  const state = MEMORY_STORE.get(chatId);
  state.rooms = (state.rooms || []).map(normalizeRoom);
  return state;
}

async function saveState(env, chatId, state) {
  const cleanState = {
    activeRoomId: state?.activeRoomId || null,
    rooms: Array.isArray(state?.rooms) ? state.rooms.map(normalizeRoom) : [],
  };

  if (env?.ROOM_KV) {
    await env.ROOM_KV.put(stateKey(chatId), JSON.stringify(cleanState));
    return cleanState;
  }

  MEMORY_STORE.set(chatId, cleanState);
  return cleanState;
}

function createRoomId() {
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRoom(room) {
  const today = getToday();
  const safe = room || {};

  safe.id = safe.id || createRoomId();
  safe.nama = safe.nama || "Topik";
  safe.status = safe.status || "Aktif";
  safe.topik = safe.topik || "Topik belum ditentukan";
  safe.tanggal = safe.tanggal || today;
  safe.percakapan = Array.isArray(safe.percakapan) ? safe.percakapan : [];
  safe.ingatan = safe.ingatan || {};
  safe.ingatan.topik = safe.ingatan.topik || safe.topik;
  safe.ingatan.pengetahuan = safe.ingatan.pengetahuan || "Belum ada pengetahuan tetap.";
  safe.ingatan.status = safe.ingatan.status || safe.status;
  safe.ingatan.tanggal = safe.ingatan.tanggal || safe.tanggal || today;

  return safe;
}

export async function createRoom(env, chatId) {
  const state = await loadState(env, chatId);
  const roomNumber = state.rooms.length + 1;
  const today = getToday();

  const room = normalizeRoom({
    id: createRoomId(),
    nama: `Topik ${roomNumber}`,
    status: "Aktif",
    topik: "Topik belum ditentukan",
    tanggal: today,
    percakapan: [],
    ingatan: {
      topik: "Topik belum ditentukan",
      pengetahuan: "Belum ada pengetahuan tetap.",
      status: "Aktif",
      tanggal: today,
    },
  });

  state.rooms.push(room);
  state.activeRoomId = room.id;
  await saveState(env, chatId, state);
  return room;
}

export async function getActiveRoom(env, chatId) {
  const state = await loadState(env, chatId);
  if (!state.activeRoomId) return null;

  const room = state.rooms.find((item) => item.id === state.activeRoomId);
  if (!room || room.status !== "Aktif") {
    state.activeRoomId = null;
    await saveState(env, chatId, state);
    return null;
  }

  return normalizeRoom(room);
}

export async function setActiveRoom(env, chatId, roomId, updatedRoom = null) {
  const state = await loadState(env, chatId);
  const index = state.rooms.findIndex((room) => room.id === roomId);
  if (index < 0) return null;

  if (updatedRoom) state.rooms[index] = normalizeRoom(updatedRoom);
  state.activeRoomId = roomId;
  await saveState(env, chatId, state);
  return normalizeRoom(state.rooms[index]);
}

export async function getRoomById(env, chatId, roomId) {
  const state = await loadState(env, chatId);
  const room = state.rooms.find((item) => item.id === roomId) || null;
  return room ? normalizeRoom(room) : null;
}

export async function listActiveRooms(env, chatId) {
  const state = await loadState(env, chatId);
  return state.rooms.filter((room) => room.status === "Aktif").map(normalizeRoom);
}

export function updateRoomConversation(room, role, text) {
  normalizeRoom(room);

  room.percakapan.push({
    role,
    text: String(text || ""),
    tanggal: getToday(),
  });

  room.percakapan = room.percakapan.slice(-12);

  if (room.topik === "Topik belum ditentukan" && role === "Mentor") {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    room.topik = raw ? raw.slice(0, 60) : "Topik tanpa judul";
    room.ingatan.topik = room.topik;
  }

  return room;
}

export async function archiveRoom(env, chatId, roomId) {
  const state = await loadState(env, chatId);
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room) return null;

  normalizeRoom(room);
  room.status = "Arsip";
  room.ingatan.status = "Arsip";

  if (state.activeRoomId === roomId) state.activeRoomId = null;
  await saveState(env, chatId, state);
  return room;
}

export async function saveRoom(env, chatId, room) {
  if (!room || !room.id) return null;

  const state = await loadState(env, chatId);
  const normalizedRoom = normalizeRoom(room);
  const index = state.rooms.findIndex((item) => item.id === normalizedRoom.id);

  if (index >= 0) state.rooms[index] = normalizedRoom;
  else state.rooms.push(normalizedRoom);

  if (normalizedRoom.status === "Aktif") state.activeRoomId = normalizedRoom.id;
  await saveState(env, chatId, state);
  return normalizedRoom;
}
