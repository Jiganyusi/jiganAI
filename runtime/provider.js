export async function callProvider(env, systemPrompt, userText) {
  const searchContext = shouldUseSearch(userText)
    ? await callTavily(env, userText)
    : "";

  const finalPrompt = [
    systemPrompt,
    "",
    searchContext ? `# INFORMASI DARI SEARCH PROVIDER\n${searchContext}` : "",
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
      errors.join("\n") || "Tidak ada provider yang aktif.",
    ].join("\n"),
  };
}

function getProviderOrder(env) {
  const configured = String(env.AI_PROVIDER || "").trim().toLowerCase();

  if (configured) {
    return unique([configured, "conduit", "openrouter", "openai", "gemini"]);
  }

  const order = [];
  if (env.CONDUIT_API_KEY) order.push("conduit");
  if (env.OPENROUTER_API_KEY) order.push("openrouter");
  if (env.OPENAI_API_KEY) order.push("openai");
  if (env.GEMINI_API_KEY) order.push("gemini");

  return unique(order.length ? order : ["conduit", "gemini"]);
}

function shouldUseSearch(text) {
  const q = String(text || "").toLowerCase();

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
    "dokumentasi",
    "dokumen",
    "api baru",
    "endpoint",
    "conduit",
    "ozdoev",
    "search",
    "cari",
    "cek",
    "lihat repo",
    "github",
    "url",
    "https://",
  ];

  return keywords.some((keyword) => q.includes(keyword));
}

async function callAiProvider(provider, env, systemPrompt, userText) {
  if (provider === "conduit") return callOpenAICompatible({
    name: "Conduit",
    apiKey: env.CONDUIT_API_KEY,
    baseUrl: env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1",
    model: env.CONDUIT_MODEL || env.AI_MODEL || "gpt-4o-mini",
    systemPrompt,
    userText,
  });

  if (provider === "openrouter") return callOpenAICompatible({
    name: "OpenRouter",
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    model: env.OPENROUTER_MODEL || env.AI_MODEL || "openai/gpt-4o-mini",
    systemPrompt,
    userText,
    extraHeaders: {
      "HTTP-Referer": env.APP_URL || "https://github.com/Jiganyusi/jiganAI",
      "X-Title": "Jiganyusi",
    },
  });

  if (provider === "openai") return callOpenAICompatible({
    name: "OpenAI",
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: env.OPENAI_MODEL || env.AI_MODEL || "gpt-4o-mini",
    systemPrompt,
    userText,
  });

  if (provider === "gemini") return callGemini(env, systemPrompt, userText);

  return { ok: false, text: `AI_PROVIDER '${provider}' belum didukung.` };
}

async function callOpenAICompatible({ name, apiKey, baseUrl, model, systemPrompt, userText, extraHeaders = {} }) {
  if (!apiKey) return { ok: false, text: `${name.toUpperCase()}_API_KEY belum terbaca.` };

  const url = `${String(baseUrl).replace(/\/$/, "")}/chat/completions`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.2,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      text: data?.error?.message || data?.message || `${name} error ${response.status}`,
    };
  }

  return {
    ok: true,
    text: data?.choices?.[0]?.message?.content || `${name} berhasil dipanggil, tetapi tidak mengembalikan teks.`,
  };
}

async function callGemini(env, systemPrompt, userText) {
  if (!env.GEMINI_API_KEY) return { ok: false, text: "GEMINI_API_KEY belum terbaca." };

  const model = env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, text: data?.error?.message || `Gemini error ${response.status}` };
  }

  return {
    ok: true,
    text: data?.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini berhasil dipanggil, tetapi tidak mengembalikan teks.",
  };
}

async function callTavily(env, query) {
  if (!env.TAVILY_API_KEY) {
    return "Search Provider belum aktif karena TAVILY_API_KEY belum terbaca.";
  }

  const response = await fetchWithTimeout("https://api.tavily.com/search", {
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
  }, 12000);

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return `Search Provider error: ${data?.error || response.status}`;
  }

  const results = data?.results || [];
  if (!results.length) return "Search Provider tidak menemukan hasil yang relevan.";

  return results.map((item, index) => [
    `${index + 1}. ${item.title || "Tanpa judul"}`,
    item.url ? `URL: ${item.url}` : "",
    item.content ? `Ringkasan: ${item.content}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

async function fetchWithTimeout(url, options, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
