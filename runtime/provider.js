export async function callProvider(env, systemPrompt, userText) {
  const searchContext = shouldUseSearch(userText) ? await callTavily(env, userText) : "";
  const finalPrompt = [
    systemPrompt,
    searchContext ? `# INFORMASI DARI SEARCH PROVIDER\n${searchContext}` : "",
  ].filter(Boolean).join("\n\n");

  return callTextPool(env, finalPrompt, userText, searchContext);
}

export async function callFileProvider(env, systemPrompt, payload) {
  const { kind, mimeType, base64, text, caption, filename } = payload;

  if (kind === "text") {
    const prompt = [
      caption ? `Instruksi Mentor: ${caption}` : "Mentor mengirim file teks/kode. Baca isi file ini lalu jawab sesuai konteks.",
      "",
      `Nama file: ${filename || "file"}`,
      `MIME: ${mimeType || "text/plain"}`,
      "",
      "# ISI FILE",
      text || "[file kosong]",
    ].join("\n");
    return callProvider(env, systemPrompt, prompt);
  }

  const prompt = [
    systemPrompt,
    "",
    kind === "image"
      ? "Mentor mengirim gambar/screenshot. Analisis isi gambar dan jawab sesuai permintaan Mentor."
      : "Mentor mengirim dokumen. Baca isi dokumen dan jawab sesuai permintaan Mentor.",
    caption ? `Instruksi Mentor: ${caption}` : "Jika tidak ada instruksi khusus, jelaskan isi file secara ringkas dan bagian pentingnya.",
    filename ? `Nama file: ${filename}` : "",
    mimeType ? `MIME: ${mimeType}` : "",
  ].filter(Boolean).join("\n");

  const pool = kind === "image" ? await buildVisionPool(env) : await buildDocumentPool(env);
  const errors = [];

  for (const item of pool) {
    const result = await callFileModel(item, env, prompt, mimeType, base64);
    if (isGoodResult(result)) return { ok: true, text: result.text, provider: item.provider, model: item.model };
    errors.push(`${item.provider}/${item.model}: ${result.text}`);
  }

  return {
    ok: false,
    text: [
      kind === "image" ? "Semua model pembaca gambar gagal dipakai." : "Semua model pembaca dokumen gagal dipakai.",
      "",
      "Ringkasan error:",
      errors.slice(0, 12).join("\n") || "Tidak ada model yang tersedia.",
    ].join("\n"),
  };
}

async function callTextPool(env, systemPrompt, userText, searchContext = "") {
  const pool = await buildTextPool(env);
  const errors = [];

  for (const item of pool) {
    const result = await callTextModel(item, env, systemPrompt, userText);
    if (isGoodResult(result)) {
      return { ok: true, text: result.text, provider: item.provider, model: item.model, usedSearch: Boolean(searchContext) };
    }
    errors.push(`${item.provider}/${item.model}: ${result.text}`);
  }

  if (searchContext) {
    return {
      ok: true,
      text: `Mentor, semua AI Provider sedang gagal dipakai.\nNamun Search Provider berhasil mengambil informasi berikut:\n\n${searchContext}`,
      provider: "tavily",
      model: null,
      usedSearch: true,
    };
  }

  return { ok: false, text: `Semua AI Provider gagal dipakai.\n\nRingkasan error:\n${errors.slice(0, 12).join("\n") || "Tidak ada model yang tersedia."}` };
}

async function buildTextPool(env) {
  const pool = [];
  if (env.CONDUIT_API_KEY) for (const model of await fetchConduitModels(env)) pool.push({ provider: "conduit", model });
  if (env.GEMINI_API_KEY) for (const model of await fetchGeminiModels(env)) pool.push({ provider: "gemini", model });
  return rankModels(uniquePool(pool).filter(isLikelyTextModel), "text").slice(0, 24);
}

async function buildVisionPool(env) {
  const pool = [];
  if (env.CONDUIT_API_KEY) for (const model of await fetchConduitModels(env)) pool.push({ provider: "conduit", model });
  if (env.GEMINI_API_KEY) for (const model of await fetchGeminiModels(env)) pool.push({ provider: "gemini", model });
  return rankModels(uniquePool(pool).filter(isLikelyVisionModel), "vision").slice(0, 24);
}

async function buildDocumentPool(env) {
  const pool = [];
  // Untuk PDF/DOCX/XLSX/PPTX, Gemini inlineData paling stabil di Cloudflare Worker tanpa library parser.
  if (env.GEMINI_API_KEY) for (const model of await fetchGeminiModels(env)) pool.push({ provider: "gemini", model });
  // Conduit tetap dimasukkan hanya kalau modelnya kemungkinan vision/file multimodal. Model yang tidak cocok akan gagal dan dilewati.
  if (env.CONDUIT_API_KEY) for (const model of await fetchConduitModels(env)) pool.push({ provider: "conduit", model });
  return rankModels(uniquePool(pool).filter(isLikelyDocumentModel), "document").slice(0, 24);
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

function modelName(item) { return String(item?.model || "").toLowerCase(); }
function isBadModelName(n) { return n.includes("embedding") || n.includes("embed") || n.includes("audio") || n.includes("tts") || n.includes("whisper") || n.includes("image-generation") || n.includes("moderation"); }
function isLikelyTextModel(item) { const n = modelName(item); return n && !isBadModelName(n); }
function isLikelyVisionModel(item) { const n = modelName(item); if (!n || isBadModelName(n)) return false; return item.provider === "gemini" || n.includes("gpt-4o") || n.includes("gpt-4.1") || n.includes("gpt-5") || n.includes("claude") || n.includes("sonnet") || n.includes("opus") || n.includes("grok") || n.includes("qwen") || n.includes("vision") || n.includes("gemini"); }
function isLikelyDocumentModel(item) { const n = modelName(item); if (!n || isBadModelName(n)) return false; return item.provider === "gemini" || n.includes("gemini") || n.includes("claude") || n.includes("gpt-4o") || n.includes("gpt-4.1") || n.includes("gpt-5"); }
function rankModels(pool, task) { return pool.sort((a, b) => scoreModel(b, task) - scoreModel(a, task)); }

function scoreModel(item, task) {
  const n = modelName(item);
  let s = 0;
  if (item.provider === "conduit") s += 100;
  if (item.provider === "gemini") s += task === "document" ? 130 : 90;

  if (n.includes("flash-lite")) s += 42;
  if (n.includes("flash")) s += 40;
  if (n.includes("mini")) s += 35;
  if (n.includes("qwen")) s += 32;
  if (n.includes("deepseek")) s += 30;
  if (n.includes("gpt-5")) s += 28;
  if (n.includes("gpt-4.1")) s += 26;
  if (n.includes("gpt-4o")) s += 25;
  if (n.includes("sonnet")) s += 23;
  if (n.includes("grok")) s += 20;
  if (n.includes("opus")) s += 14;
  if (n.includes("pro")) s += task === "document" ? 12 : -6;
  if (isBadModelName(n)) s -= 1000;
  return s;
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
  const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${env.CONDUIT_API_KEY}` } });
  const data = await response.json().catch(() => null);
  if (!response.ok) return [];
  return (Array.isArray(data?.data) ? data.data : [])
    .map((x) => typeof x === "string" ? x : (x.id || x.name || x.model || ""))
    .filter(Boolean);
}

async function fetchGeminiModels(env) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) return [];
  return (Array.isArray(data?.models) ? data.models : [])
    .filter((x) => Array.isArray(x.supportedGenerationMethods) && x.supportedGenerationMethods.includes("generateContent"))
    .map((x) => x.name || "")
    .filter(Boolean);
}

async function callConduitText(env, model, systemPrompt, userText) {
  const baseUrl = String(env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CONDUIT_API_KEY}` },
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
  if (!response.ok) return { ok: false, text: data?.error?.message || data?.message || `Conduit error ${response.status}` };
  return { ok: true, text: extractConduitText(data) || "Conduit berhasil dipanggil, tetapi tidak mengembalikan teks." };
}

async function callConduitFile(env, model, prompt, mimeType, base64) {
  // OpenAI-compatible endpoint umum paling aman untuk gambar. Untuk PDF/Office, Gemini akan menangani lebih dulu.
  if (!String(mimeType || "").startsWith("image/")) return { ok: false, text: "Conduit file non-gambar dilewati; coba provider dokumen lain." };
  const baseUrl = String(env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1").replace(/\/$/, "");
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CONDUIT_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] },
      ],
      temperature: 0.3,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, text: data?.error?.message || data?.message || `Conduit vision error ${response.status}` };
  return { ok: true, text: extractConduitText(data) || "Conduit berhasil membaca gambar, tetapi tidak mengembalikan teks." };
}

function extractConduitText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((x) => x?.text || x?.content || "").filter(Boolean).join("\n");
  return "";
}

async function callGeminiText(env, model, systemPrompt, userText) {
  const cleanModel = String(model).replace(/^models\//, "");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, text: data?.error?.message || `Gemini error ${response.status}` };
  return { ok: true, text: extractGeminiText(data) || "Gemini berhasil dipanggil, tetapi tidak mengembalikan teks." };
}

async function callGeminiFile(env, model, prompt, mimeType, base64) {
  const cleanModel = String(model).replace(/^models\//, "");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, text: data?.error?.message || `Gemini file error ${response.status}` };
  return { ok: true, text: extractGeminiText(data) || "Gemini berhasil membaca file, tetapi tidak mengembalikan teks." };
}

function extractGeminiText(data) {
  return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").filter(Boolean).join("\n");
}

function isGoodResult(result) {
  if (!result?.ok) return false;
  const text = String(result.text || "").trim();
  if (!text) return false;
  const bad = [
    "the response did not generate correctly",
    "please resend the last message",
    "tidak mengembalikan teks",
    "i can't view",
    "cannot view images",
  ];
  return !bad.some((x) => text.toLowerCase().includes(x));
}

function shouldUseSearch(text) {
  const q = String(text || "").toLowerCase();
  return ["terbaru", "hari ini", "sekarang", "real time", "realtime", "skor", "harga", "berita", "jadwal", "piala dunia", "crypto", "saham", "dokumen", "dokumentasi", "api baru", "conduit", "ozdoev", "search", "cari", "cek"].some((k) => q.includes(k));
}

async function callTavily(env, query) {
  if (!env.TAVILY_API_KEY) return "";
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 5 }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return `Search Provider error: ${data?.error || response.status}`;
  const results = data?.results || [];
  if (!results.length) return "Search Provider tidak menemukan hasil yang relevan.";
  return results.map((item, i) => [`${i + 1}. ${item.title || "Tanpa judul"}`, item.url ? `URL: ${item.url}` : "", item.content ? `Ringkasan: ${item.content}` : ""].filter(Boolean).join("\n")).join("\n\n");
}
