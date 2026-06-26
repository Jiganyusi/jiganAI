export async function callProvider(env, systemPrompt, userText) {
  if (!env.GEMINI_API_KEY) {
    return {
      ok: false,
      text: "GEMINI_API_KEY belum terbaca di Cloudflare Secret.",
    };
  }

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
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
    return {
      ok: false,
      text: `Provider AI error: ${data?.error?.message || response.status}`,
    };
  }

  return {
    ok: true,
    text:
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Saya belum berhasil mendapatkan jawaban dari provider AI.",
  };
}
