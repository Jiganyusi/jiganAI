export async function callProvider(env, systemPrompt, userText) {
  const searchContext = shouldUseSearch(userText) ? await callTavily(env, userText) : "";
  const finalPrompt = [
    systemPrompt,
    searchContext ? `# INFORMASI DARI SEARCH PROVIDER\n${searchContext}` : "",
  ].filter(Boolean).join("\n\n");

  return callTextPool(env, finalPrompt, userText, searchContext);
}

export async function callFileProvider(env, systemPrompt, payload) {
  const { kind, mimeType, base64, caption } = payload;

  const prompt = [
    systemPrompt,
    "",
    kind === "pdf"
      ? "Mentor mengirim file PDF. Baca isi dokumen dan jawab sesuai permintaan Mentor."
      : "Mentor mengirim gambar/screenshot. Analisis isi gambar, teks yang terlihat, tombol/menu, dan bagian pentingnya. Jika ada informasi sensitif, ingatkan Mentor untuk menyensor.",
    caption ? `Instruksi Mentor: ${caption}` : "Jika tidak ada instruksi khusus, jelaskan isi file secara ringkas dan bagian pentingnya.",
  ].join("\n");

  const pool = kind === "pdf" ? await buildDocumentPool(env) : await buildVisionPool(env);
  const errors = [];

  for (const item of pool) {
    const result = await callFileModel(item, env, prompt, mimeType, base64);

    if (result.ok && !isBadGeneratedText(result.text)) {
      return {
        ok: true,
        text: result.text,
        provider: item.provider,
        model: item.model,
      };
    }

    errors.push(`${item.provider}/${item.model}: ${result.text || "respons kosong/tidak valid"}`);
  }

  return {
    ok: false,
    text: [
      kind === "pdf" ? "Semua model pembaca PDF gagal dipakai." : "Semua model pembaca gambar gagal dipakai.",
      "",
      "Ringkasan error:",
      errors.slice(0, 12).join("\n"),
    ].join("\n"),
  };
}

async function callTextPool(env, systemPrompt, userText, searchContext = "") {
  const pool = await buildTextPool(env);
  const errors = [];

  for (const item of pool) {
    const result = await callTextModel(item, env, systemPrompt, userText);

    if (result.ok && !isBadGeneratedText(result.text)) {
      return {
        ok: true,
        text: result.text,
        provider: item.provider,
        model: item.model,
        usedSearch: Boolean(searchContext),
      };
    }

    errors.push(`${item.provider}/${item.model}: ${result.text || "respons kosong/tidak valid"}`);
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

async function buildTextPool(env) {
  const pool = [];

  if (env.CONDUIT_API_KEY) {
    for (const model of await fetchConduitModels(env)) {
      pool.push({ provider: "conduit", model });
    }
  }

  if (env.GEMINI_API_KEY) {
    for (const model of await fetchGeminiModels(env)) {
      pool.push({ provider: "gemini", model });
    }
  }

  return rankModels(uniquePool(pool), "text").slice(0, 20);
}

async function buildVisionPool(env) {
  const pool = [];

  if (env.CONDUIT_API_KEY) {
    for (const model of await fetchConduitModels(env)) {
      pool.push({ provider: "conduit", model });
    }
  }

  if (env.GEMINI_API_KEY) {
    for (const model of await fetchGeminiModels(env)) {
      pool.push({ provider: "gemini", model });
    }
  }

  return rankModels(uniquePool(pool).filter(isLikelyVisionModel), "vision").slice(0, 20);
}

async function buildDocumentPool(env) {
  const pool = [];

  if (env.GEMINI_API_KEY) {
    for (const model of await fetchGeminiModels(env)) {
      pool.push({ provider: "gemini", model });
    }
  }

  if (env.CONDUIT_API_KEY) {
    for (const model of await fetchConduitModels(env)) {
      pool.push({ provider: "conduit", model });
    }
  }

  return rankModels(uniquePool(pool).filter(isLikelyDocumentModel), "document").slice(0, 20);
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

function isLikelyVisionModel(item) {
  const n = String(item.model || "").toLowerCase();

  if (n.includes("embedding") || n.includes("audio") || n.includes("tts")) return false;

  // Gemini generateContent models with inlineData are usable for image.
  if (item.provider === "gemini") return true;

  // Conduit: only try model families that commonly accept OpenAI-style image_url.
  return (
    n.includes("gpt-4o") ||
    n.includes("gpt-4.1") ||
    n.includes("gpt-5") ||
    n.includes("claude") ||
    n.includes("sonnet") ||
    n.includes("opus") ||
    n.includes("grok") ||
    n.includes("gemini") ||
    n.includes("vision")
  );
}

function isLikelyDocumentModel(item) {
  const n = String(item.model || "").toLowerCase();

  if (n.includes("embedding") || n.includes("audio") || n.includes("image")) return false;

  // PDF inlineData paling aman melalui Gemini. Conduit PDF tidak dipaksa karena endpoint OpenAI-compatible
  // biasanya tidak menerima PDF base64 sebagai image_url.
  return item.provider === "gemini";
}

function rankModels(pool, task) {
  return pool.sort((a, b) => scoreModel(b, task) - scoreModel(a, task));
}

function scoreModel(item, task) {
  const n = String(item.model || "").toLowerCase();
  let score = 0;

  if (task === "document") {
    if (item.provider === "gemini") score += 200;
  } else if (task === "vision") {
    if (item.provider === "gemini") score += 140;
    if (item.provider === "conduit") score += 100;
  } else {
    if (item.provider === "conduit") score += 120;
    if (item.provider === "gemini") score += 90;
  }

  if (n.includes("flash-lite")) score += 35;
  if (n.includes("flash")) score += 32;
  if (n.includes("gpt-4o")) score += 30;
  if (n.includes("gpt-4.1")) score += 28;
  if (n.includes("gpt-5-mini")) score += 27;
  if (n.includes("gpt-5")) score += 25;
  if (n.includes("sonnet")) score += 23;
  if (n.includes("gemini-2.5-flash")) score += 22;
  if (n.includes("gemini-2.5-pro")) score += task === "document" ? 24 : 12;
  if (n.includes("qwen")) score += 18;
  if (n.includes("grok")) score += 16;
  if (n.includes("deepseek")) score += 14;
  if (n.includes("mini")) score += 8;
  if (n.includes("pro")) score += task === "document" ? 6 : -4;
  if (n.includes("embedding")) score -= 1000;
  if (n.includes("audio")) score -= 500;

  return score;
}

async function callTextModel(item, env, systemPrompt, userText) {
  if (item.provider === "conduit") return callConduitText(env, item.model, systemPrompt, userText);
  if (item.provider === "gemini") return callGeminiText(env, item.model, systemPrompt, userText);
  return { ok: false, text: `Provider '${item.provider}' belum didukung.` };
}

async function callFileModel(item, env, prompt, mimeType, base64) {
  if (item.provider === "gemini") return callGeminiFile(env, item.model, prompt, mimeType, base64);
  if (item.provider === "conduit") return callConduitFile(env, item.model, prompt, mimeType, base64);
  return { ok: false, text: `Provider '${item.provider}' belum didukung.` };
}

async function fetchConduitModels(env) {
  const baseUrl = String(env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1").replace(/\/$/, "");

  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${env.CONDUIT_API_KEY}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) return [];

  return (Array.isArray(data?.data) ? data.data : [])
    .map((item) => {
      if (typeof item === "string") return item;
      return item.id || item.name || item.model || "";
    })
    .filter(Boolean);
}

async function fetchGeminiModels(env) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) return [];

  return (Array.isArray(data?.models) ? data.models : [])
    .filter((item) =>
      Array.isArray(item.supportedGenerationMethods) &&
      item.supportedGenerationMethods.includes("generateContent")
    )
    .map((item) => item.name || "")
    .filter(Boolean);
}

async function callConduitText(env, model, systemPrompt, userText) {
  const baseUrl = String(env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1").replace(/\/$/, "");

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

async function callConduitFile(env, model, prompt, mimeType, base64) {
  if (mimeType === "application/pdf") {
    return { ok: false, text: "Conduit PDF langsung belum diaktifkan; coba model dokumen lain." };
  }

  const baseUrl = String(env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1").replace(/\/$/, "");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.CONDUIT_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
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
        `Conduit vision error ${response.status}`,
    };
  }

  return {
    ok: true,
    text:
      data?.choices?.[0]?.message?.content ||
      "Conduit berhasil membaca gambar, tetapi tidak mengembalikan teks.",
  };
}

async function callGeminiText(env, model, systemPrompt, userText) {
  const cleanModel = String(model).replace(/^models\//, "");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
      }),
    }
  );

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

async function callGeminiFile(env, model, prompt, mimeType, base64) {
  const cleanModel = String(model).replace(/^models\//, "");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64 } },
            ],
          },
        ],
      }),
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      text: data?.error?.message || `Gemini file error ${response.status}`,
    };
  }

  return {
    ok: true,
    text:
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Gemini berhasil membaca file, tetapi tidak mengembalikan teks.",
  };
}

function isBadGeneratedText(text) {
  const t = String(text || "").toLowerCase();

  return (
    !t.trim() ||
    t.includes("the response did not generate correctly") ||
    t.includes("please resend the last message") ||
    t.includes("continue without resetting the session") ||
    t.includes("tidak mengembalikan teks")
  );
}

function shouldUseSearch(text) {
  const q = String(text || "").toLowerCase();

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
  ].some((keyword) => q.includes(keyword));
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
  if (!response.ok) return `Search Provider error: ${data?.error || response.status}`;

  const results = data?.results || [];
  if (!results.length) return "Search Provider tidak menemukan hasil yang relevan.";

  return results
    .map((item, index) =>
      [
        `${index + 1}. ${item.title || "Tanpa judul"}`,
        item.url ? `URL: ${item.url}` : "",
        item.content ? `Ringkasan: ${item.content}` : "",
      ].filter(Boolean).join("\n")
    )
    .join("\n\n");
}
