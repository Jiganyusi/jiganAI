const ROOMS = new Map();

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Jiganyusi Worker aktif.", { status: 200 });
    }

    const update = await request.json().catch(() => null);
    const message = update?.message;

    if (!message) return new Response("OK", { status: 200 });

    const chatId = message.chat.id;
    const text = message.text || "";

    const reply = await processMessage(chatId, text, env);

    await sendTelegramMessage(env.BOT_TOKEN, chatId, reply);

    return new Response("OK", { status: 200 });
  },
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getRoom(chatId) {
  if (!ROOMS.has(chatId)) {
    ROOMS.set(chatId, {
      nama: "Default",
      status: "Aktif",
      topik: "Percakapan Telegram Mentor",
      tanggal: getToday(),
      percakapan: [],
      ingatan: {
        topik: "Percakapan Telegram Mentor",
        pengetahuan: "Belum ada pengetahuan tetap.",
        status: "Aktif",
        tanggal: getToday(),
      },
    });
  }

  return ROOMS.get(chatId);
}

function updateRoom(room, role, text) {
  room.percakapan.push({ role, text });
  room.percakapan = room.percakapan.slice(-8);
}

function updateMemory(room, text) {
  room.ingatan.pengetahuan = `Percakapan terakhir Mentor membahas: ${text}`;
  room.ingatan.tanggal = getToday();
}

function buildSystemPrompt(room) {
  const conversation = room.percakapan
    .map((item) => `${item.role}: ${item.text}`)
    .join("\n");

  return [
    "Kamu adalah Jiganyusi, AI Partner pribadi Mentor.",
    "",
    "Identitas:",
    "- Panggil pengguna dengan sebutan Mentor.",
    "- Jawab singkat, jelas, dan langsung ke inti.",
    "- Jangan muter-muter.",
    "- Jangan menggurui.",
    "- Jangan menghakimi.",
    "- Jangan memberi harapan palsu.",
    "- Jika belum bisa, katakan belum bisa dengan tenang.",
    "",
    "Prinsip utama:",
    "- Pahami konteks sebelum menjawab.",
    "- Jika pertanyaan Mentor pendek seperti 'gimana?', 'lanjut', atau 'supaya bisa gimana?', hubungkan dengan percakapan sebelumnya di Room aktif.",
    "- Ruangan menyimpan percakapan.",
    "- Ingatan menyimpan pengetahuan yang lahir dari percakapan.",
    "",
    "Kondisi sistem saat ini:",
    "- Jiganyusi sudah terhubung ke Telegram.",
    "- Jiganyusi sudah terhubung ke Gemini sebagai AI Provider.",
    "- Jiganyusi memiliki Room sementara berbasis chat Telegram.",
    "- Jiganyusi belum memiliki memory permanen.",
    "- Jiganyusi belum bisa membaca PDF, gambar, atau file Telegram secara langsung.",
    "- Jiganyusi belum memiliki akses web/search real-time.",
    "",
    "Room aktif:",
    `Nama Ruangan: ${room.nama}`,
    `Status: ${room.status}`,
    `Topik: ${room.topik}`,
    `Tanggal: ${room.tanggal}`,
    "",
    "Ingatan aktif:",
    `Topik: ${room.ingatan.topik}`,
    `Pengetahuan: ${room.ingatan.pengetahuan}`,
    `Status: ${room.ingatan.status}`,
    `Tanggal: ${room.ingatan.tanggal}`,
    "",
    "Percakapan terakhir di Room:",
    conversation || "Belum ada.",
    "",
    "Gunakan Bahasa Indonesia.",
  ].join("\n");
}

async function processMessage(chatId, text, env) {
  if (!text.trim()) {
    return "Saya menerima pesan kosong, Mentor.";
  }

  if (!env.GEMINI_API_KEY) {
    return "GEMINI_API_KEY belum terbaca di Cloudflare Secret.";
  }

  const room = getRoom(chatId);

  updateRoom(room, "Mentor", text);
  updateMemory(room, text);

  const reply = await callGemini(env.GEMINI_API_KEY, buildSystemPrompt(room), text);

  updateRoom(room, "Jiganyusi", reply);

  return reply;
}

async function callGemini(apiKey, systemPrompt, userText) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userText }],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return `Provider AI error: ${data?.error?.message || response.status}`;
  }

  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "Saya belum berhasil mendapatkan jawaban dari provider AI."
  );
}

async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}
