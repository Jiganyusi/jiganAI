export async function callProvider(env, systemPrompt, userText) {
  const searchContext = shouldUseSearch(userText) ? await callTavily(env, userText) : "";
  const finalPrompt = [systemPrompt, searchContext ? `# INFORMASI DARI SEARCH PROVIDER\n${searchContext}` : ""].filter(Boolean).join("\n\n");
  return callTextPool(env, finalPrompt, userText, searchContext);
}

export async function callFileProvider(env, systemPrompt, payload) {
  const { kind, mimeType, base64, caption } = payload;
  const prompt = [
    systemPrompt,
    "",
    kind === "pdf" ? "Mentor mengirim file PDF. Baca isi dokumen dan jawab sesuai permintaan Mentor." : "Mentor mengirim gambar. Analisis gambar dan jawab sesuai permintaan Mentor.",
    caption ? `Instruksi Mentor: ${caption}` : "Jika tidak ada instruksi khusus, jelaskan isi file secara ringkas dan bagian pentingnya.",
  ].join("\n");

  const pool = kind === "pdf" ? await buildDocumentPool(env) : await buildVisionPool(env);
  const errors = [];

  for (const item of pool) {
    const result = await callFileModel(item, env, prompt, mimeType, base64);
    if (result.ok) return { ok: true, text: result.text, provider: item.provider, model: item.model };
    errors.push(`${item.provider}/${item.model}: ${result.text}`);
  }

  return {
    ok: false,
    text: [
      kind === "pdf" ? "Semua model pembaca PDF gagal dipakai." : "Semua model pembaca gambar gagal dipakai.",
      "",
      "Ringkasan error:",
      errors.slice(0, 10).join("\n"),
    ].join("\n"),
  };
}

async function callTextPool(env, systemPrompt, userText, searchContext = "") {
  const pool = await buildTextPool(env);
  const errors = [];
  for (const item of pool) {
    const result = await callTextModel(item, env, systemPrompt, userText);
    if (result.ok) return { ok: true, text: result.text, provider: item.provider, model: item.model, usedSearch: Boolean(searchContext) };
    errors.push(`${item.provider}/${item.model}: ${result.text}`);
  }
  if (searchContext) return { ok: true, text: `Mentor, semua AI Provider sedang gagal dipakai.\nNamun Search Provider berhasil mengambil informasi berikut:\n\n${searchContext}`, provider: "tavily", model: null, usedSearch: true };
  return { ok: false, text: `Semua AI Provider gagal dipakai.\n\nRingkasan error:\n${errors.slice(0, 12).join("\n")}` };
}

async function buildTextPool(env) {
  const pool = [];
  if (env.CONDUIT_API_KEY) for (const model of await fetchConduitModels(env)) pool.push({ provider: "conduit", model });
  if (env.GEMINI_API_KEY) for (const model of await fetchGeminiModels(env)) pool.push({ provider: "gemini", model });
  return rankModels(uniquePool(pool), "text").slice(0, 20);
}

async function buildVisionPool(env) {
  const pool = [];
  if (env.CONDUIT_API_KEY) for (const model of await fetchConduitModels(env)) pool.push({ provider: "conduit", model });
  if (env.GEMINI_API_KEY) for (const model of await fetchGeminiModels(env)) pool.push({ provider: "gemini", model });
  return rankModels(uniquePool(pool).filter(isLikelyVisionModel), "vision").slice(0, 20);
}

async function buildDocumentPool(env) {
  const pool = [];
  if (env.GEMINI_API_KEY) for (const model of await fetchGeminiModels(env)) pool.push({ provider: "gemini", model });
  if (env.CONDUIT_API_KEY) for (const model of await fetchConduitModels(env)) pool.push({ provider: "conduit", model });
  return rankModels(uniquePool(pool).filter(isLikelyDocumentModel), "document").slice(0, 20);
}

function uniquePool(pool) { const seen = new Set(); return pool.filter(x => { const k = `${x.provider}:${x.model}`; if (seen.has(k)) return false; seen.add(k); return true; }); }
function isLikelyVisionModel(item) { const n = item.model.toLowerCase(); if (n.includes("embedding") || n.includes("audio")) return false; return item.provider === "gemini" || n.includes("gpt") || n.includes("claude") || n.includes("grok") || n.includes("qwen") || n.includes("vision") || n.includes("gemini"); }
function isLikelyDocumentModel(item) { const n = item.model.toLowerCase(); if (n.includes("embedding") || n.includes("audio") || n.includes("image")) return false; return item.provider === "gemini" || n.includes("claude") || n.includes("gpt") || n.includes("gemini"); }
function rankModels(pool, task) { return pool.sort((a,b) => scoreModel(b, task) - scoreModel(a, task)); }
function scoreModel(item, task) { const n = item.model.toLowerCase(); let s = 0; if (item.provider === "conduit") s += 100; if (item.provider === "gemini") s += task === "document" ? 120 : 80; if (n.includes("flash")) s += 30; if (n.includes("mini")) s += 25; if (n.includes("gpt-5")) s += 24; if (n.includes("gpt-4.1")) s += 23; if (n.includes("gpt-4o")) s += 22; if (n.includes("sonnet")) s += 20; if (n.includes("qwen")) s += 18; if (n.includes("grok")) s += 16; if (n.includes("pro")) s += task === "document" ? 10 : -5; if (n.includes("embedding")) s -= 1000; if (n.includes("audio")) s -= 500; return s; }

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
  const data = await response.json().catch(() => null); if (!response.ok) return [];
  return (Array.isArray(data?.data) ? data.data : []).map(x => typeof x === "string" ? x : (x.id || x.name || x.model || "")).filter(Boolean);
}
async function fetchGeminiModels(env) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
  const data = await response.json().catch(() => null); if (!response.ok) return [];
  return (Array.isArray(data?.models) ? data.models : []).filter(x => Array.isArray(x.supportedGenerationMethods) && x.supportedGenerationMethods.includes("generateContent")).map(x => x.name || "").filter(Boolean);
}

async function callConduitText(env, model, systemPrompt, userText) {
  const baseUrl = String(env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CONDUIT_API_KEY}` }, body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userText }], temperature: 0.3 }) });
  const data = await response.json().catch(() => null); if (!response.ok) return { ok: false, text: data?.error?.message || data?.message || `Conduit error ${response.status}` };
  return { ok: true, text: data?.choices?.[0]?.message?.content || "Conduit berhasil dipanggil, tetapi tidak mengembalikan teks." };
}
async function callConduitFile(env, model, prompt, mimeType, base64) {
  if (mimeType === "application/pdf") return { ok: false, text: "Conduit file PDF belum dipakai langsung; coba model lain." };
  const baseUrl = String(env.CONDUIT_BASE_URL || "https://conduit.ozdoev.net/api/v1").replace(/\/$/, "");
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CONDUIT_API_KEY}` }, body: JSON.stringify({ model, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }], temperature: 0.3 }) });
  const data = await response.json().catch(() => null); if (!response.ok) return { ok: false, text: data?.error?.message || data?.message || `Conduit vision error ${response.status}` };
  return { ok: true, text: data?.choices?.[0]?.message?.content || "Conduit berhasil membaca gambar, tetapi tidak mengembalikan teks." };
}
async function callGeminiText(env, model, systemPrompt, userText) {
  const cleanModel = String(model).replace(/^models\//, "");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: [{ text: userText }] }] }) });
  const data = await response.json().catch(() => null); if (!response.ok) return { ok: false, text: data?.error?.message || `Gemini error ${response.status}` };
  return { ok: true, text: data?.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini berhasil dipanggil, tetapi tidak mengembalikan teks." };
}
async function callGeminiFile(env, model, prompt, mimeType, base64) {
  const cleanModel = String(model).replace(/^models\//, "");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }] }) });
  const data = await response.json().catch(() => null); if (!response.ok) return { ok: false, text: data?.error?.message || `Gemini file error ${response.status}` };
  return { ok: true, text: data?.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini berhasil membaca file, tetapi tidak mengembalikan teks." };
}
function shouldUseSearch(text) { const q = String(text || "").toLowerCase(); return ["terbaru","hari ini","sekarang","real time","realtime","skor","harga","berita","jadwal","piala dunia","crypto","saham","dokumen","dokumentasi","api baru","conduit","ozdoev","search","cari","cek"].some(k => q.includes(k)); }
async function callTavily(env, query) {
  if (!env.TAVILY_API_KEY) return "";
  const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TAVILY_API_KEY}` }, body: JSON.stringify({ query, search_depth: "basic", max_results: 5 }) });
  const data = await response.json().catch(() => null); if (!response.ok) return `Search Provider error: ${data?.error || response.status}`;
  const results = data?.results || []; if (!results.length) return "Search Provider tidak menemukan hasil yang relevan.";
  return results.map((item, i) => [`${i+1}. ${item.title || "Tanpa judul"}`, item.url ? `URL: ${item.url}` : "", item.content ? `Ringkasan: ${item.content}` : ""].filter(Boolean).join("\n")).join("\n\n");
}
