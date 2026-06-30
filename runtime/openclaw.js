const DEFAULT_BASE_CANDIDATES = [
  "https://raw.githubusercontent.com/Jiganyusi/jiganAI/main/openclaw",
  "https://raw.githubusercontent.com/Jiganyusi/jiganAI/main/otak/openclaw",
];

const BOOT_FILES = [
  "AGENTS.md",
  "IDENTITY.md",
  "SOUL.md",
  "HEARTBEAT.md",
  "TOOLS.md",
  "MEMORY.md",
  "USER.md",
];

const OPTIONAL_FILES = ["INDEX.md", "README.md", "CHANGELOG-v3.md", "memory/2026-05.md"];

const SKILLS = [
  { id: "m1", file: "skills/m1.md", domain: "Value generation & business", high: ["monetize", "pricing", "jualan", "cuan", "funnel"], med: ["business", "income", "sell", "revenue", "produk"], low: ["bayar", "uang"] },
  { id: "m2", file: "skills/m2.md", domain: "Infrastructure & deployment", high: ["vps", "deploy", "ssh", "nginx", "docker", "systemd"], med: ["server", "linux", "hosting", "cloudflare"], low: ["install", "terminal"] },
  { id: "m3", file: "skills/m3.md", domain: "Content & narrative", high: ["viral", "hook", "caption", "thread", "konten", "naskah"], med: ["copywriting", "post", "draft"], low: ["tulis", "iklan"] },
  { id: "m4", file: "skills/m4.md", domain: "Bots, automation & triggers", high: ["telegram bot", "webhook", "cron", "n8n", "otomatis", "automation"], med: ["bot", "schedule", "jadwal", "worker"], low: ["trigger", "run"] },
  { id: "m5", file: "skills/m5.md", domain: "Data transformation", high: ["excel", "spreadsheet", "csv", "dataset", "laporan"], med: ["data", "analytics", "report"], low: ["angka", "stats"] },
  { id: "m6", file: "skills/m6.md", domain: "API, webhook & integration", high: ["api", "webhook", "endpoint", "integrasi", "rest"], med: ["sdk", "connect", "koneksi", "conduit", "tavily"], low: ["token", "key", "secret"] },
  { id: "m7", file: "skills/m7.md", domain: "LLM, provider & agent architecture", high: ["llm", "openrouter", "claude api", "prompt", "agent"], med: ["ai", "model", "provider", "gemini", "gpt", "claude", "qwen", "deepseek", "grok"], low: ["reasoning", "inference"] },
  { id: "m8", file: "skills/m8.md", domain: "Files, PDF, DOCX, XLSX, images", high: ["pdf", "docx", "xlsx", "pptx", "dokumen", "gambar"], med: ["file", "image", "export"], low: ["format", "render"] },
  { id: "m9", file: "skills/m9.md", domain: "Frontend & interface", high: ["react", "tailwind", "frontend", "landing page", "ui"], med: ["website", "html", "css"], low: ["design", "web"] },
  { id: "m10", file: "skills/m10.md", domain: "Web3 operations", high: ["wallet", "airdrop", "on-chain", "rpc", "ethers", "viem", "mint"], med: ["crypto", "web3", "token", "blockchain", "swap"], low: ["claim"] },
  { id: "m11", file: "skills/m11.md", domain: "Security audit", high: ["security", "audit", "vulnerability", "exploit", "malicious", "scam"], med: ["aman", "review", "verify"], low: ["cek"] },
  { id: "m12", file: "skills/m12.md", domain: "Batch & parallel operations", high: ["batch", "parallel", "bulk", "mass", "queue"], med: ["concurrent", "banyak", "throughput"], low: ["multi"] },
  { id: "m13", file: "skills/m13.md", domain: "NFT minting", high: ["nft", "mint", "opensea", "manifold", "zora", "seadrop"], med: ["contract", "collection"], low: ["drop"] },
  { id: "x1", file: "skills/x1.md", domain: "Self-audit & system refinement", high: ["self-audit", "audit system", "upgrade brain", "review agent"], med: ["refactor", "improve", "optimasi"], low: ["evaluasi"] },
  { id: "x2", file: "skills/x2.md", domain: "Strategy & decomposition", high: ["strategy", "architecture", "roadmap", "decompose"], med: ["strategi", "arsitektur", "rencana", "design system"], low: ["pikir", "analisa"] },
  { id: "x3", file: "skills/x3.md", domain: "Debug & fault diagnosis", high: ["error", "bug", "debug", "gagal", "stack trace"], med: ["failed", "fix", "crash", "kenapa", "kok"], low: ["issue"] },
];

const CACHE = new Map();
let WORKING_BASE = null;

export function routeSkills(userText) {
  const q = String(userText || "").toLowerCase();

  return SKILLS.map((skill) => ({
    ...skill,
    score: score(skill, q),
  }))
    .filter((skill) => skill.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export async function buildOpenClawContext({ room, userText, env }) {
  const boot = await loadFiles(BOOT_FILES, env);
  const optional = await loadFiles(OPTIONAL_FILES, env, true);
  const registry = await loadFile("skills/m0.md", env, true);

  const selectedSkills = selectSkills(userText);
  const skillFiles = await loadFiles(selectedSkills.map((skill) => skill.file), env, true);

  const loaded = [...boot, ...optional, registry, ...skillFiles].filter((item) => item?.ok);
  const failed = [...boot, ...optional, registry, ...skillFiles].filter((item) => item && !item.ok);

  return [
    "# JIGANYUSI / OPENCLAW RUNTIME CONTEXT",
    "",
    "OpenClaw adalah sistem operasi berpikir. Jalankan sebagai workflow: boot → route skill → refleksi → eksekusi.",
    "Identitas operasional sekarang adalah Jiganyusi. Pengguna dipanggil Mentor.",
    "",
    "## BOOT ORDER WAJIB",
    "1. AGENTS.md",
    "2. IDENTITY.md + SOUL.md",
    "3. HEARTBEAT.md + TOOLS.md + MEMORY.md",
    "4. USER.md",
    "5. skills/m0.md sebagai registry + reflection loop",
    "6. skills/m*.md atau x*.md sesuai routing, maksimal 3 skill kecuali benar-benar perlu",
    "",
    "## FILE YANG TERBACA",
    loaded.map((item) => `- ${item.path}`).join("\n") || "- Tidak ada file OpenClaw yang berhasil dimuat.",
    failed.length ? `\n## FILE GAGAL DIMUAT\n${failed.map((item) => `- ${item.path}: ${item.error}`).join("\n")}` : "",
    "",
    "## SKILL TERPILIH",
    selectedSkills.length
      ? selectedSkills.map((skill) => `- ${skill.id}: ${skill.domain} (score ${skill.score})`).join("\n")
      : "- Tidak ada skill khusus. Gunakan core OpenClaw.",
    "",
    "## CORE OPENCLAW + SKILL CONTENT",
    loaded.map((item) => `\n### FILE: ${item.path}\n${item.text}`).join("\n\n---\n"),
    "",
    "## ROOM AKTIF",
    `Nama: ${room?.nama || "-"}`,
    `Status: ${room?.status || "-"}`,
    `Topik: ${room?.topik || "-"}`,
    `Tanggal: ${room?.tanggal || "-"}`,
    "",
    "## INGATAN AKTIF",
    `Topik: ${room?.ingatan?.topik || room?.topik || "-"}`,
    `Pengetahuan: ${room?.ingatan?.pengetahuan || "Belum ada."}`,
    `Status: ${room?.ingatan?.status || room?.status || "-"}`,
    `Tanggal: ${room?.ingatan?.tanggal || room?.tanggal || "-"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function selectSkills(userText) {
  const routed = routeSkills(userText);
  if (!routed.length) return [];

  const primary = routed[0];
  const supporting = routed.filter((skill) => skill.id !== primary.id && skill.score >= primary.score * 0.5);
  return [primary, ...supporting].slice(0, 3);
}

function score(skill, q) {
  return (
    countHits(q, skill.high, 3) +
    countHits(q, skill.med, 2) +
    countHits(q, skill.low, 1)
  );
}

function countHits(text, keywords, weight) {
  return keywords.reduce((total, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = text.match(new RegExp(escaped, "gi"));
    return total + (matches ? matches.length * weight : 0);
  }, 0);
}

async function loadFiles(paths, env, optional = false) {
  return Promise.all(paths.map((path) => loadFile(path, env, optional)));
}

async function loadFile(path, env, optional = false) {
  try {
    const text = await fetchText(path, env);
    return { ok: true, path, text: trimForPrompt(text) };
  } catch (err) {
    if (optional) return { ok: false, path, error: err.message || String(err) };
    throw err;
  }
}

function getBaseCandidates(env) {
  if (env.OPENCLAW_BASE_URL) {
    return [String(env.OPENCLAW_BASE_URL).replace(/\/$/, "")];
  }

  return DEFAULT_BASE_CANDIDATES;
}

async function fetchText(path, env) {
  const cacheKey = `${env.OPENCLAW_BASE_URL || "default"}:${path}`;
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

  const bases = WORKING_BASE ? [WORKING_BASE, ...getBaseCandidates(env)] : getBaseCandidates(env);

  for (const base of unique(bases)) {
    const res = await fetch(`${base}/${path}`);
    if (!res.ok) continue;
    const text = await res.text();
    WORKING_BASE = base;
    CACHE.set(cacheKey, text);
    return text;
  }

  throw new Error(`OpenClaw load failed: ${path}`);
}

function trimForPrompt(text) {
  const maxChars = 12000;
  const clean = String(text || "").trim();
  if (clean.length <= maxChars) return clean;
  return clean.slice(0, maxChars) + "\n\n[TRUNCATED BY RUNTIME: file terlalu panjang]";
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
