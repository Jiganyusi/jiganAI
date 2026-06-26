export async function callProvider(env, systemPrompt, userText) {
  if (!env.GEMINI_API_KEY) {
    return {
      ok: false,
      text: "GEMINI_API_KEY belum terbaca di Cloudflare Secret.",
    };
  }

  const needsSearch = shouldUseSearch(userText);

  let searchContext = "";

  if (needsSearch) {
    searchContext = await callTavily(env, userText);
  }

  const finalPrompt = [
    systemPrompt,
    "",
    searchContext
      ? `Informasi real-time dari Search Provider:\n${searchContext}`
      : "",
  ].join("\n");

  const geminiText = await callGemini(env.GEMINI_API_KEY, finalPrompt, userText);

  return {
    ok: true,
    text: geminiText,
    usedSearch: Boolean(searchContext),
  };
}

function shouldUseSearch(text) {
  const query = text.toLowerCase();

  const keywords = [
    "terbaru",
    "hari ini",
    "sekarang",
    "real time",
    "realtime",
    "skor",
    "harga",
    "berita",
    "jadwal",
    "piala dunia",
    "crypto",
    "saham",
  ];

  return keywords.some((keyword) => query.includes(keyword));
}

async function callTavily(env, query) {
  if (!env.TAVILY_API_KEY) {
    return "Search Provider belum aktif karena TAVILY_API_KEY belum terbaca.";
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 5,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return `Search Provider error: ${data?.error || response.status}`;
  }

  const results = data?.results || [];

  if (!results.length) {
    return "Search Provider tidak menemukan hasil yang relevan.";
  }

  return results
    .map((item, index) => {
      return [
        `${index + 1}. ${item.title || "Tanpa judul"}`,
        item.url ? `URL: ${item.url}` : "",
        item.content ? `Ringkasan: ${item.content}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
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
