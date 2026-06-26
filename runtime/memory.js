function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export function updateMemoryFromConversation(room, mentorText) {
  room.ingatan.pengetahuan = buildSimpleKnowledge(room, mentorText);
  room.ingatan.status = "Aktif";
  room.ingatan.tanggal = getToday();
}

function buildSimpleKnowledge(room, mentorText) {
  return [
    `Topik aktif: ${room.topik}.`,
    `Pesan terbaru Mentor: ${mentorText}`,
  ].join(" ");
}
