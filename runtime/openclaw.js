const DEFAULT_BASE_CANDIDATES = [
  "https://raw.githubusercontent.com/Jiganyusi/jiganAI/main/openclaw",
  "https://raw.githubusercontent.com/Jiganyusi/jiganAI/main/otak/openclaw",
];

const CORE_FILES = [
  "AGENTS.md",
  "IDENTITY.md",
  "SOUL.md",
  "HEARTBEAT.md",
  "TOOLS.md",
  "MEMORY.md",
  "USER.md",
];

const OPTIONAL_FILES = [
  "INDEX.md",
  "README.md",
  "memory/2026-05.md",
];

const SKILLS = [
  {
    id: "m1",
    file: "skills/m1.md",
    domain: "Monetization & value generation",
    high: ["monetize", "pricing", "jual", "jualan", "cuan", "funnel"],
    med: ["business", "income", "sell", "revenue"],
    low: ["money", "produk", "bayar"],
  },
  {
    id: "m2",
    file: "skills/m2.md",
    domain: "Infrastructure & deployment",
    high: ["vps", "deploy", "ssh", "nginx", "docker", "systemd"],
    med: ["server", "linux", "bash", "sysadmin", "hosting"],
    low: ["install", "terminal"],
  },
  {
    id: "m3",
    file: "skills/m3.md",
    domain: "Content creation & distribution",
    high: ["viral", "hook", "caption", "thread", "naskah", "konten"],
    med: ["content", "post", "copywriting", "draft"],
    low: ["tulis", "iklan"],
  },
  {
    id: "m4",
    file: "skills/m4.md",
    domain: "Process orchestration & bots",
    high: ["telegram bot", "cron", "webhook", "n8n", "automate", "otomatis"],
    med: ["bot", "schedule", "jadwal", "worker", "cloudflare"],
    low: ["trigger", "run"],
  },
  {
    id: "m5",
    file: "skills/m5.md",
    domain: "Data transformation & insight",
    high: ["spreadsheet", "excel", "csv", "dataset", "snapshot", "laporan"],
    med: ["data", "analytics", "report"],
    low: ["angka", "stats"],
  },
  {
    id: "m6",
    file: "skills/m6.md",
    domain: "Protocol binding & service bridge",
    high: ["api", "rest", "webhook", "midtrans", "integrasi", "endpoint"],
    med: ["sdk", "integration", "connect", "conduit", "tavily"],
    low: ["call", "konek", "token", "key"],
  },
  {
    id: "m7",
    file: "skills/m7.md",
    domain: "Inference systems & AI builder",
    high: ["llm", "prompt", "claude api", "openrouter", "kimi", "agent"],
    med: ["ai", "model", "gpt", "gemini", "provider", "qwen", "deepseek", "grok"],
    low: ["inference", "reasoning"],
  },
  {
    id: "m8",
    file: "skills/m8.md",
    domain: "File & artifact production",
    high: ["pdf", "docx", "xlsx", "pptx", "generate file", "dokumen"],
    med: ["export", "file", "gambar", "image"],
    low: ["format", "save"],
  },
  {
    id: "m9",
    file: "skills/m9.md",
    domain: "Interface construction",
    high: ["landing page", "react", "tailwind", "frontend", "ui"],
    med: ["website", "html", "css"],
    low: ["web", "design"],
  },
  {
    id: "m10",
    file: "skills/m10.md",
    domain: "Web3 / crypto operations",
    high: ["wallet", "airdrop", "on-chain", "rpc", "ethers", "viem", "mint"],
    med: ["crypto", "web3", "token", "blockchain", "eth", "swap"],
    low: ["claim"],
  },
  {
    id: "m11",
    file: "skills/m11.md",
    domain: "Security audit & review",
    high: ["audit", "vulnerability", "exploit", "scam check", "malicious"],
    med: ["security", "review", "safe", "aman"],
    low: ["verify", "cek"],
  },
  {
    id: "m12",
    file: "skills/m12.md",
    domain: "Batch / parallel operations",
    high: ["batch", "parallel", "bulk", "mass", "queue", "worker", "snapshot"],
    med: ["concurrent", "throughput", "banyak"],
    low: ["multi"],
  },
  {
    id: "m13",
    file: "skills/m13.md",
    domain: "Universal NFT minter",
    high: ["mint", "opensea", "manifold", "zora", "seadrop", "nft", "claim", "drop"],
    med: ["collection", "contract"],
    low: ["art"],
  },
  {
    id: "x1",
    file: "skills/x1.md",
    domain: "Internal capability refinement",
    high: ["improve system", "self-audit", "upgrade brain"],
    med: ["audit me", "review agent", "upgrade self", "refactor"],
    low: ["optimize"],
  },
  {
    id: "x2",
    file: "skills/x2.md",
    domain: "Deep decomposition & strategy",
    high: ["strategy", "architecture", "decompose", "plan", "design system"],
    med: ["strategi", "arsitektur", "rencana", "roadmap", "multi-step"],
    low: ["pikir", "analisa"],
  },
  {
    id: "x3",
    file: "skills/x3.md",
    domain: "Fault diagnosis & resolution",
    high: ["error", "bug", "debug", "gagal", "rusak", "stack trace"],
    med: ["failed", "broken", "fix", "crash", "traceback"],
    low: ["issue", "kenapa"],
  },
];

const CACHE = new Map();
let WORKING_BASE = null;

function getBaseCandidates(env) {
  if (env.OPENCLAW_BASE_URL) {
    return [String(env.OPENCLAW_BASE_URL).replace(/\/$/, "")];
  }

  return DEFAULT_BASE_CANDIDATES;
}

async function fetchFromBase(base, path) {
  const res = await fetch(`${base}/${path}`);
  if (!res.ok) return null;
  return await res.text();
}

async function fetchText(path, env) {
  const cacheKey = `${env.OPENCLAW_BASE_URL || "default"}:${path}`;
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

  const bases = WORKING_BASE ? [WORKING_BASE] : getBaseCandidates(env);

  for (const base of bases) {
    const text = await fetchFromBase(base, path);
    if (text !== null) {
      WORKING_BASE = base;
      CACHE.set(cacheKey, text);
      return text;
    }
  }

  throw new Error(`OpenClaw load failed: ${path}`);
}

async function fetchOptional(path, env) {
  try {
    return await fetchText(path, env);
  } catch {
    return "";
  }
}

function countHits(text, keywords, weight) {
  return keywords.reduce((score, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = text.match(new RegExp(escaped, "gi"));
    return score + (matches ? matches.length * weight : 0);
  }, 0);
}

export function routeSkills(userText) {
  const q = String(userText || "").toLowerCase();

  return SKILLS.map((skill) => ({
    ...skill,
    score:
      countHits(q, skill.high, 3) +
      countHits(q, skill.med, 2) +
      countHits(q, skill.low, 1),
  }))
    .filter((skill) => skill.score > 0)
    .sort((a, b) => b.score - a.score);
}

export async function buildOpenClawContext({ room, userText, env }) {
  const core = await Promise.all(CORE_FILES.map((file) => fetchText(file, env)));
  const index = await fetchOptional("INDEX.md", env);
  const memoryLog = await fetchOptional("memory/2026-05.md", env);

  // m0 is the registry and reflection loop. Load it first for routing discipline.
  const registry = await fetchText("skills/m0.md", env);
  const matchedSkills = routeSkills(userText);
  const selectedSkills = matchedSkills.slice(0, 3);
  const skillTexts = await Promise.all(
    selectedSkills.map((skill) => fetchText(skill.file, env))
  );

  const selectedSkillInfo = selectedSkills.length
    ? selectedSkills
        .map((skill) => `${skill.id} — ${skill.domain} (score ${skill.score})`)
        .join("\n")
    : "Tidak ada skill khusus. Jawab dari core OpenClaw.";

  return [
    "# JIGANYUSI OPENCLAW CONTEXT",
    "",
    "OpenClaw adalah kerangka kerja berpikir. Sesuaikan identitas operasional menjadi Jiganyusi.",
    "Panggil pengguna sebagai Mentor.",
    "Jangan mengaku membaca file/repo jika file itu tidak tersedia di konteks ini.",
    "Jika konteks cukup, lanjutkan tindakan tanpa bertanya yang tidak perlu.",
    "",
    "## LOAD ORDER RESMI",
    "1. AGENTS.md",
    "2. IDENTITY.md + SOUL.md",
    "3. HEARTBEAT.md + TOOLS.md + MEMORY.md",
    "4. USER.md",
    "5. skills/m0.md",
    "6. skills/m*.md/x*.md sesuai routing",
    "",
    "## CORE FILES",
    core.join("\n\n---\n\n"),
    "",
    index ? `## INDEX\n${index}` : "",
    "",
    "## SKILL REGISTRY m0",
    registry,
    "",
    "## SELECTED SKILLS",
    selectedSkillInfo,
    "",
    skillTexts.length ? skillTexts.join("\n\n---\n\n") : "Tidak ada skill tambahan yang dimuat.",
    "",
    memoryLog ? `## OPENCLAW MEMORY LOG\n${memoryLog}` : "",
    "",
    "## ROOM AKTIF",
    `Nama: ${room.nama}`,
    `Status: ${room.status}`,
    `Topik: ${room.topik}`,
    `Tanggal: ${room.tanggal}`,
    "",
    "## INGATAN AKTIF",
    `Topik: ${room.ingatan?.topik || room.topik}`,
    `Pengetahuan: ${room.ingatan?.pengetahuan || "Belum ada."}`,
    `Status: ${room.ingatan?.status || room.status}`,
    `Tanggal: ${room.ingatan?.tanggal || room.tanggal}`,
  ]
    .filter(Boolean)
    .join("\n");
}
