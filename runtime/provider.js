export async function callProvider(env, systemPrompt, userText) {
  const searchContext = shouldUseSearch(userText)
    ? await callTavily(env, userText)
    : "";

  const finalPrompt = [
    systemPrompt,
    "",
    searchContext
      ? `# INFORMASI DARI SEARCH PROVIDER\n${searchContext}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const providerOrder = getProviderOrder(env);
  const errors = [];

  for (const provider of providerOrder) {
    const result = await callAiProvider(provider, env, finalPrompt, userText);
    if (result.ok) {
      return {
        ok: true,
        text: result.text,
        provider,
        usedSearch: Boolean(searchContext),
      };
    }
    errors.push(`${provider}: ${result.text}`);
  }

  if (searchContext) {
    return {
      ok: true,
      text: [
        "Mentor, AI Provider sedang belum berhasil merangkai jawaban.",
        "Namun Search Provider berhasil mengambil informasi berikut:",
        "",
        searchContext,
      ].join("\n"),
      provider: "search-fallback",
      usedSearch: true,
    };
  }

  return {
    ok: false,
    text: [
      "Semua AI Provider gagal dipanggil.",
      "",
      "Ringkasan error:",
      errors.join("\n"),
    ].join("\n"),
  };
}

function getProviderOrder(env) {
  const configured = String(env.AI_PROVIDER || "").trim().toLowerCase();

  if (configured) {
    return unique([
      configured,
      "conduit",
      "gemini",
    ]);
  }

  if (env.CONDUIT_API_KEY) return ["conduit", "gemini"];
  return ["gemini", "conduit"];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function shouldUseSearch(text) {
  const query = String(text || "").toLowerCase();

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
    "dokumen",
    "dokumentasi",
    "api baru",
    "conduit",
    "ozdoev",
    "search",
    "cari",
    "cek",
  ];

  return keywords.some((keyword) => query.includes(keyword));
}

async function callAiProvider(provider, env, systemPrompt, userText) {
  if (provider === "conduit") return callConduit(env, systemPrompt, userText);
  if (provider === "gemini") return callGemini(env, systemPrompt, userText);

  return {
    ok: false,
    text: `AI_PROVIDER '${provider}' belum didukung.`,
  };
}

async function callConduit(env, systemPrompt, userText) {
  if (!env.CONDUIT_API_KEY) {
    return { ok: false, text: "CONDUIT_API_KEY belum terbaca." };
  }

  const baseUrl = String(env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1").replace(/\/$/, "");
  const model = env.CONDUIT_MODEL || env.AI_MODEL || "gpt-4o-mini";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.CONDUIT_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.3,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      text: data?.error?.message || data?.message || `Conduit error ${response.status}`,
    };
  }

  return {
    ok: true,
    text:
      data?.choices?.[0]?.message?.content ||
      "Conduit berhasil dipanggil, tetapi tidak mengembalikan teks.",
  };
}

async function callGemini(env, systemPrompt, userText) {
  if (!env.GEMINI_API_KEY) {
    return { ok: false, text: "GEMINI_API_KEY belum terbaca." };
  }

  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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
      text: data?.error?.message || `Gemini error ${response.status}`,
    };
  }

  return {
    ok: true,
    text:
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Gemini berhasil dipanggil, tetapi tidak mengembalikan teks.",
  };
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
