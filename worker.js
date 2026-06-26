const ROOMS = new Map();

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Jiganyusi Worker aktif.", { status: 200 });
    }

    const update = await request.json().catch(() => null);
    const message = update?.message;

    if (!message) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text || "";

    if (!text.trim()) {
      await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        "Saya menerima pesan kosong. Silakan kirim pertanyaan lagi, Mentor."
      );
      return new Response("OK", { status: 200 });
    }

    const room = getOrCreateRoom(chatId);
    addConversation(room, "Mentor", text);
    updateMemory(room, text);

    const reply = await processWithJiganyusi(room, text, env);

    addConversation(room, "Jiganyusi", reply);
    trimRoom(room);

    await sendTelegramMessage(env.BOT_TOKEN, chatId, reply);

    return new Response("OK", { status: 200 });
  },
};

function getOrCreateRoom(chatId) {
  const key = String(chatId);

  if (!ROOMS.has(key)) {
    ROOMS.set(key, {
      nama: "Default",
      status: "Aktif",
      topik: "Percakapan Telegram Mentor",
      tanggal: getToday(),
      percakapan: [],
      memory: {
        topik: "Percakapan Telegram Mentor",
        pengetahuan: "Belum ada pengetahuan yang disimpan.",
        status: "Aktif",
        tanggal: getToday(),
      },
    });
  }

  return ROOMS.get(key);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function addConversation(room, role, text) {
  room.percakapan.push({
    role,
    text,
    waktu: new Date().toISOString(),
  });
}

function updateMemory(room, text) {
  room.memory.pengetahuan = `Percakapan terakhir Mentor membahas: ${text}`;
  room.memory.tanggal = getToday();
}

function trimRoom(room) {
  room.percakapan = room.percakapan.slice(-10);
}

async function processWithJiganyusi(room, text, env) {
  if (!env.GEMINI_API_KEY) {
    return "GEMINI_API_KEY belum terbaca di Cloudflare Secret.";
  }

  if (!env.BOT_TOKEN) {
    return "BOT_TOKEN belum terbaca di Cloudflare Secret.";
  }

  const systemPrompt = buildSystemPrompt(room);
  const contents = buildGeminiContents(room, text);

  return await callGemini(env.GEMINI_API_KEY, systemPrompt, contents);
}

function buildSystemPrompt(room) {
  return [
    "Kamu adalah Jiganyusi, AI Partner pribadi Mentor.",
    "",
    "Identitas:",
    "- Jiganyusi bukan AI umum.",
    "- Jiganyusi adalah partner yang membantu Mentor memahami masalah dan mengambil keputusan.",
    "- Mentor tetap pengambil keputusan akhir.",
    "",
    "Gaya jawaban:",
    "- Panggil pengguna dengan sebutan Mentor.",
    "- Jawab singkat, jelas, dan langsung ke inti.",
    "- Jangan muter-muter.",
    "- Jangan menggurui.",
    "- Jangan menghakimi.",
    "- Jangan menakut-nakuti.",
    "- Jangan memberi harapan palsu.",
    "- Jika perlu pilihan, jelaskan sisi manis dan pahitnya.",
    "",
    "Aturan konteks:",
    "- Pahami pesan Mentor berdasarkan Room aktif.",
    "- Jika Mentor bertanya pendek seperti 'gimana?', 'lanjut', atau 'supaya bisa gimana?', hubungkan dengan percakapan sebelumnya di Room.",
    "- Ruangan menyimpan percakapan.",
    "- Ingatan menyimpan pengetahuan yang lahir dari percakapan.",
    "",
    "Kondisi sistem saat ini:",
    "- Jiganyusi sudah terhubung ke Telegram.",
    "- Jiganyusi sudah terhubung ke Gemini sebagai AI Provider.",
    "- Jiganyusi memiliki Room sementara di Worker.",
    "- Room ini belum permanen. Jika Worker restart, Room dapat hilang.",
    "- Jiganyusi belum bisa membaca gambar, PDF, atau file Telegram secara langsung.",
    "- Jiganyusi belum memiliki memory permanen seperti KV, D1, atau database.",
    "",
    "Room aktif:",
    `- Nama Ruangan: ${room.nama}`,
    `- Status: ${room.status}`,
    `- Topik: ${room.topik}`,
    `- Tanggal: ${room.tanggal}`,
    "",
    "Ingatan aktif:",
    `- Topik: ${room.memory.topik}`,
    `- Pengetahuan: ${room.memory.pengetahuan}`,
    `- Status: ${room.memory.status}`,
    `- Tanggal: ${room.memory.tanggal}`,
    "",
    "Gunakan Bahasa Indonesia.",
  ].join("\n");
}

function buildGeminiContents(room, latestText) {
  const recentConversation = room.percakapan.slice(-8).map((item) => {
    return `${item.role}: ${item.text}`;
  }).join("\n");

  return [
    {
      role: "user",
      parts: [
        {
          text: [
            "Berikut konteks percakapan terakhir di Room aktif:",
            "",
            recentConversation || "Belum ada percakapan sebelumnya.",
            "",
            "Pesan terbaru Mentor:",
            latestText,
          ].join("\n"),
        },
      ],
    },
  ];
}

async function callGemini(apiKey, systemPrompt, contents) {
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
      contents,
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
