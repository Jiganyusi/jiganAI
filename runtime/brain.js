import { buildOpenClawContext } from "./openclaw.js";

export async function buildBrainPrompt(room, userText) {
  const conversation = (room.percakapan || [])
    .map((item) => `${item.role}: ${item.text}`)
    .join("\n");

  const openclawContext = await buildOpenClawContext({ room, userText });

  return [
    openclawContext,
    "",
    "## PERCAKAPAN TERAKHIR DI ROOM",
    conversation || "Belum ada.",
    "",
    "## ATURAN JIGANYUSI",
    "- Jangan menjawab berdasarkan asumsi jika file/konteks belum dibaca.",
    "- Jika belum membaca file yang diminta, katakan belum.",
    "- Sebelum memberi patch kode, pahami struktur repo dan file terkait.",
    "- Jawab singkat, jelas, dan tidak muter-muter.",
    "",
    "Gunakan Bahasa Indonesia.",
  ].join("\n");
}

export function buildBrainResponse(providerResult) {
  if (!providerResult.ok) return providerResult.text;
  return providerResult.text;
}
