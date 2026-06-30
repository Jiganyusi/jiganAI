const MEMORY_STORE = new Map();

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function emptyState() {
  return {
    activeRoomId: null,
    rooms: [],
  };
}

function key(chatId) {
  return `rooms:${chatId}`;
}

async function loadState(env, chatId) {
  if (env.ROOM_KV) {
    const saved = await env.ROOM_KV.get(key(chatId), "json");
    if (saved && Array.isArray(saved.rooms)) {
      return {
        activeRoomId: saved.activeRoomId || null,
        rooms: saved.rooms,
      };
    }
    return emptyState();
  }

  if (!MEMORY_STORE.has(chatId)) {
    MEMORY_STORE.set(chatId, emptyState());
  }

  return MEMORY_STORE.get(chatId);
}

async function saveState(env, chatId, state) {
  if (env.ROOM_KV) {
    await env.ROOM_KV.put(key(chatId), JSON.stringify(state));
    return;
  }

  MEMORY_STORE.set(chatId, state);
}

function createRoomId() {
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRoom(room) {
  if (!room.ingatan) {
    room.ingatan = {
      topik: room.topik || "Topik belum ditentukan",
      pengetahuan: "Belum ada pengetahuan tetap.",
      status: room.status || "Aktif",
      tanggal: room.tanggal || getToday(),
    };
  }

  if (!Array.isArray(room.percakapan)) {
    room.percakapan = [];
  }

  return room;
}

export async function createRoom(env, chatId) {
  const state = await loadState(env, chatId);
  const roomNumber = state.rooms.length + 1;

  const room = {
    id: createRoomId(),
    nama: `Topik ${roomNumber}`,
    status: "Aktif",
    topik: "Topik belum ditentukan",
    tanggal: getToday(),
    percakapan: [],
    ingatan: {
      topik: "Topik belum ditentukan",
      pengetahuan: "Belum ada pengetahuan tetap.",
      status: "Aktif",
      tanggal: getToday(),
    },
  };

  state.rooms.push(room);
  state.activeRoomId = room.id;
  await saveState(env, chatId, state);

  return room;
}

export async function getActiveRoom(env, chatId) {
  const state = await loadState(env, chatId);

  if (!state.activeRoomId) {
    return null;
  }

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

  if (index < 0) {
    return null;
  }

  if (updatedRoom) {
    state.rooms[index] = normalizeRoom(updatedRoom);
  }

  state.activeRoomId = roomId;
  await saveState(env, chatId, state);

  return state.rooms[index];
}

export async function getRoomById(env, chatId, roomId) {
  const state = await loadState(env, chatId);
  const room = state.rooms.find((item) => item.id === roomId) || null;
  return room ? normalizeRoom(room) : null;
}

export async function listActiveRooms(env, chatId) {
  const state = await loadState(env, chatId);
  return state.rooms
    .filter((room) => room.status === "Aktif")
    .map(normalizeRoom);
}

export function updateRoomConversation(room, role, text) {
  normalizeRoom(room);

  room.percakapan.push({
    role,
    text,
    tanggal: getToday(),
  });

  room.percakapan = room.percakapan.slice(-12);

  if (room.topik === "Topik belum ditentukan" && role === "Mentor") {
    room.topik = String(text || "").slice(0, 60) || "Topik tanpa judul";
    room.ingatan.topik = room.topik;
  }

  return room;
}

export async function archiveRoom(env, chatId, roomId) {
  const state = await loadState(env, chatId);
  const room = state.rooms.find((item) => item.id === roomId);

  if (!room) {
    return null;
  }

  normalizeRoom(room);
  room.status = "Arsip";
  room.ingatan.status = "Arsip";

  if (state.activeRoomId === roomId) {
    state.activeRoomId = null;
  }

  await saveState(env, chatId, state);
  return room;
}

export async function saveRoom(env, chatId, room) {
  if (!room || !room.id) {
    return null;
  }

  const state = await loadState(env, chatId);
  const normalizedRoom = normalizeRoom(room);
  const index = state.rooms.findIndex((item) => item.id === normalizedRoom.id);

  if (index >= 0) {
    state.rooms[index] = normalizedRoom;
  } else {
    state.rooms.push(normalizedRoom);
  }

  if (!state.activeRoomId && normalizedRoom.status === "Aktif") {
    state.activeRoomId = normalizedRoom.id;
  }

  await saveState(env, chatId, state);
  return normalizedRoom;
}
