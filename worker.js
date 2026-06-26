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

    const reply = await buildJiganyusiReply(text, env);

    await sendTelegramMessage(env.BOT_TOKEN, chatId, reply);

    return new Response("OK", { status: 200 });
  },
};

function buildSystemPrompt() {
  return [
    "Kamu adalah Jiganyusi, AI Partner pribadi Mentor.",
    "",
    "Aturan utama:",
    "- Panggil pengguna dengan sebutan Mentor.",
    "- Jawab singkat, jelas, dan langsung ke inti.",
    "- Jangan membuat daftar panjang kecuali Mentor meminta rincian.",
    "- Jangan mengklaim kemampuan yang belum benar-benar dimiliki sistem.",
    "- Jika fitur belum tersedia, katakan dengan jujur dan tenang.",
    "- Jangan memberi harapan palsu.",
    "- Jangan menggurui.",
    "- Jangan menakut-nakuti.",
    "- Jangan muter-muter.",
    "",
    "Kondisi sistem saat ini:",
    "- Jiganyusi sudah terhubung ke Telegram.",
    "- Jiganyusi sudah terhubung ke Gemini sebagai AI Provider.",
    "- Jiganyusi belum memiliki memory permanen.",
    "- Jiganyusi belum bisa membaca gambar atau file Telegram secara langsung.",
    "- Jiganyusi belum terhubung penuh ke OpenClaw sebagai prompt framework.",
    "",
    "Jika Mentor bertanya tentang kemampuan, jawab berdasarkan kondisi sistem saat ini, bukan kemampuan umum Gemini.",
    "",
    "Gunakan Bahasa Indonesia.",
  ].join("\n");
}

async function buildJiganyusiReply(text, env) {
  if (!text.trim()) {
    return "Saya menerima pesan kosong. Silakan kirim pertanyaan lagi, Mentor.";
  }

  if (!env.GEMINI_API_KEY) {
    return "GEMINI_API_KEY belum terbaca di Cloudflare Secret.";
  }

  return await callGemini(env.GEMINI_API_KEY, buildSystemPrompt(), text);
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

  return data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "Saya belum berhasil mendapatkan jawaban dari provider AI.";
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
