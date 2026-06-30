const BASE =
  "https://raw.githubusercontent.com/Jiganyusi/jiganAI/main/otak/openclaw";

const CORE_FILES = [
  "AGENTS.md",
  "IDENTITY.md",
  "SOUL.md",
  "HEARTBEAT.md",
  "TOOLS.md",
  "MEMORY.md",
  "USER.md",
];

const SKILL_RULES = [
  { id: "m4", file: "skills/m4.md", keys: ["telegram", "bot", "webhook", "otomatis", "cron"] },
  { id: "m6", file: "skills/m6.md", keys: ["api", "webhook", "integrasi", "endpoint"] },
  { id: "m7", file: "skills/m7.md", keys: ["ai", "llm", "provider", "model", "gemini", "openrouter", "agent"] },
  { id: "m8", file: "skills/m8.md", keys: ["pdf", "docx", "xlsx", "file", "gambar", "dokumen"] },
  { id: "x1", file: "skills/x1.md", keys: ["audit", "review", "upgrade", "improve"] },
  { id: "x2", file: "skills/x2.md", keys: ["strategi", "arsitektur", "rencana", "roadmap"] },
  { id: "x3", file: "skills/x3.md", keys: ["error", "gagal", "bug", "debug", "kenapa"] },
];

const CACHE = new Map();

async function fetchText(path) {
  if (CACHE.has(path)) return CACHE.get(path);

  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`OpenClaw load failed: ${path}`);

  const text = await res.text();
  CACHE.set(path, text);
  return text;
}

function pickSkills(input) {
  const q = input.toLowerCase();

  return SKILL_RULES
    .map((skill) => ({
      ...skill,
      score: skill.keys.reduce((n, k) => n + (q.includes(k) ? 1 : 0), 0),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export async function buildOpenClawContext({ room, userText }) {
  const core = await Promise.all(CORE_FILES.map(fetchText));
  const skills = await Promise.all(pickSkills(userText).map((s) => fetchText(s.file)));

  return [
    "# JIGANYUSI OPENCLAW CONTEXT",
    "",
    "Gunakan OpenClaw sebagai kerangka berpikir.",
    "Sesuaikan identitas menjadi Jiganyusi, bukan SUPERAGENT.",
    "Panggil pengguna sebagai Mentor.",
    "",
    "## CORE FILES",
    core.join("\n\n---\n\n"),
    "",
    "## LOADED SKILLS",
    skills.length ? skills.join("\n\n---\n\n") : "Tidak ada skill khusus yang cocok.",
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
  ].join("\n");
}
