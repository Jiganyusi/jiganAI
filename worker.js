export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Jiganyusi Worker aktif.", { status: 200 });
    }

    const update = await request.json().catch(() => null);

    if (!update || !update.message) {
      return new Response("OK", { status: 200 });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text || "";

    const reply = buildJiganyusiReply(text);

    await sendTelegramMessage(env.BOT_TOKEN, chatId, reply);

    return new Response("OK", { status: 200 });
  },
};

function buildJiganyusiReply(text) {
  if (!text.trim()) {
    return "Saya menerima pesan kosong. Silakan kirim pertanyaan lagi, Mentor.";
  }

  return [
    "Baik, Mentor.",
    "",
    "Saya sudah menerima pesan:",
    text,
    "",
    "Saat ini Worker Jiganyusi sudah terhubung ke Telegram.",
    "Tahap berikutnya adalah menghubungkan Otak/OpenClaw dengan API AI agar saya bisa mulai menjawab dengan reasoning.",
  ].join("\n");
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
