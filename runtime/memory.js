function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export function updateMemoryFromConversation(room, text) {
  if (!room.ingatan) {
    room.ingatan = {
      topik: room.topik || "Topik belum ditentukan",
      pengetahuan: "Belum ada pengetahuan tetap.",
      status: room.status || "Aktif",
      tanggal: getToday(),
    };
  }

  room.ingatan.topik = room.topik;
  room.ingatan.pengetahuan = `Percakapan terakhir Mentor membahas: ${text}`;
  room.ingatan.status = room.status;
  room.ingatan.tanggal = getToday();

  return room.ingatan;
}
