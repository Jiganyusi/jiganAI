const ROOM_STORE = new Map();
const ACTIVE_ROOM = new Map();

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getRooms(chatId) {
  if (!ROOM_STORE.has(chatId)) {
    ROOM_STORE.set(chatId, []);
  }

  return ROOM_STORE.get(chatId);
}

function createRoomId() {
  return `room-${Date.now()}`;
}

export function createRoom(chatId) {
  const rooms = getRooms(chatId);
  const roomNumber = rooms.length + 1;

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

  rooms.push(room);
  return room;
}

export function getActiveRoom(chatId) {
  const roomId = ACTIVE_ROOM.get(chatId);

  if (!roomId) {
    return null;
  }

  return getRoomById(chatId, roomId);
}

export function setActiveRoom(chatId, roomId) {
  ACTIVE_ROOM.set(chatId, roomId);
}

export function getRoomById(chatId, roomId) {
  const rooms = getRooms(chatId);
  return rooms.find((room) => room.id === roomId) || null;
}

export function listActiveRooms(chatId) {
  const rooms = getRooms(chatId);
  return rooms.filter((room) => room.status === "Aktif");
}

export function updateRoomConversation(room, role, text) {
  room.percakapan.push({
    role,
    text,
    tanggal: getToday(),
  });

  room.percakapan = room.percakapan.slice(-10);

  if (room.topik === "Topik belum ditentukan" && role === "Mentor") {
    room.topik = text.slice(0, 60);
    room.ingatan.topik = room.topik;
  }

  return room;
}

export function archiveRoom(chatId, roomId) {
  const room = getRoomById(chatId, roomId);

  if (!room) {
    return null;
  }

  room.status = "Arsip";
  room.ingatan.status = "Arsip";

  if (ACTIVE_ROOM.get(chatId) === roomId) {
    ACTIVE_ROOM.delete(chatId);
  }

  return room;
}
