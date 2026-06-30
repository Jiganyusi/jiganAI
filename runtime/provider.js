export async function callProvider(env, systemPrompt, userText) {
  const searchContext = shouldUseSearch(userText)
    ? await callTavily(env, userText)
    : "";

  const finalPrompt = [
    systemPrompt,
    searchContext ? `# INFORMASI DARI SEARCH PROVIDER\n${searchContext}` : "",
  ].filter(Boolean).join("\n\n");

  const aiPool = await buildAiPool(env);
  const errors = [];

  for (const item of aiPool) {
    const result = await callModel(item, env, finalPrompt, userText);

    if (result.ok) {
      return {
        ok: true,
        text: result.text,
        provider: item.provider,
        model: item.model,
        usedSearch: Boolean(searchContext),
      };
    }

    errors.push(`${item.provider}/${item.model}: ${result.text}`);
  }

  if (searchContext) {
    return {
      ok: true,
      text: [
        "Mentor, semua AI Provider sedang gagal dipakai.",
        "Namun Search Provider berhasil mengambil informasi berikut:",
        "",
        searchContext,
      ].join("\n"),
      provider: "tavily",
      model: null,
      usedSearch: true,
    };
  }

  return {
    ok: false,
    text: [
      "Semua AI Provider gagal dipakai.",
      "",
      "Ringkasan error:",
      errors.slice(0, 12).join("\n"),
    ].join("\n"),
  };
}

async function buildAiPool(env) {
  const pool = [];

  if (env.CONDUIT_API_KEY) {
    const conduitModels = await fetchConduitModels(env);
    for (const model of conduitModels) {
      pool.push({ provider: "conduit", model });
    }
  }

  if (env.GEMINI_API_KEY) {
    const geminiModels = await fetchGeminiModels(env);
    for (const model of geminiModels) {
      pool.push({ provider: "gemini", model });
    }
  }

  return rankModels(uniquePool(pool)).slice(0, 20);
}

function uniquePool(pool) {
  const seen = new Set();
  return pool.filter((item) => {
    const key = `${item.provider}:${item.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankModels(pool) {
  return pool.sort((a, b) => scoreModel(b) - scoreModel(a));
}

function scoreModel(item) {
  const name = String(item.model || "").toLowerCase();
  let score = 0;

  if (item.provider === "conduit") score += 100;
  if (item.provider === "gemini") score += 80;

  if (name.includes("mini")) score += 30;
  if (name.includes("flash-lite")) score += 28;
  if (name.includes("flash")) score += 25;
  if (name.includes("qwen")) score += 24;
  if (name.includes("deepseek")) score += 23;
  if (name.includes("gpt-5")) score += 22;
  if (name.includes("gpt-4.1")) score += 21;
  if (name.includes("gpt-4o")) score += 20;
  if (name.includes("sonnet")) score += 18;
  if (name.includes("grok")) score += 15;
  if (name.includes("pro")) score -= 5;
  if (name.includes("audio")) score -= 30;
  if (name.includes("image")) score -= 30;
  if (name.includes("embedding")) score -= 100;

  return score;
}

async function callModel(item, env, systemPrompt, userText) {
  if (item.provider === "conduit") {
    return callConduitModel(env, item.model, systemPrompt, userText);
  }

  if (item.provider === "gemini") {
    return callGeminiModel(env, item.model, systemPrompt, userText);
  }

  return {
    ok: false,
    text: `Provider '${item.provider}' belum didukung.`,
  };
}

async function fetchConduitModels(env) {
  const baseUrl = String(
    env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1"
  ).replace(/\/$/, "");

  const response = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.CONDUIT_API_KEY}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) return [];

  const rows = Array.isArray(data?.data) ? data.data : [];

  return rows
    .map((item) => {
      if (typeof item === "string") return item;
      return item.id || item.name || item.model || "";
    })
    .filter(Boolean);
}

async function fetchGeminiModels(env) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json().catch(() => null);

  if (!response.ok) return [];

  const models = Array.isArray(data?.models) ? data.models : [];

  return models
    .filter((item) =>
      Array.isArray(item.supportedGenerationMethods) &&
      item.supportedGenerationMethods.includes("generateContent")
    )
    .map((item) => item.name || "")
    .filter(Boolean);
}

async function callConduitModel(env, model, systemPrompt, userText) {
  const baseUrl = String(
    env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1"
  ).replace(/\/$/, "");

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
      text:
        data?.error?.message ||
        data?.message ||
        `Conduit error ${response.status}`,
    };
  }

  return {
    ok: true,
    text:
      data?.choices?.[0]?.message?.content ||
      "Conduit berhasil dipanggil, tetapi tidak mengembalikan teks.",
  };
}

async function callGeminiModel(env, model, systemPrompt, userText) {
  const cleanModel = String(model).replace(/^models\//, "");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`;

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

function shouldUseSearch(text) {
  const query = String(text || "").toLowerCase();

  return [
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
  ].some((keyword) => query.includes(keyword));
}

async function callTavily(env, query) {
  if (!env.TAVILY_API_KEY) return "";

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
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}
