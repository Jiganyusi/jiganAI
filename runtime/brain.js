import { buildOpenClawContext, routeSkills } from "./openclaw.js";

export async function buildBrainPrompt(room, userText, env) {
  const conversation = (room.percakapan || [])
    .map((item) => `${item.role}: ${item.text}`)
    .join("\n");

  const openclawContext = await buildOpenClawContext({ room, userText, env });
  const routedSkills = routeSkills(userText)
    .slice(0, 3)
    .map((skill) => `${skill.id}: ${skill.domain} (${skill.score})`)
    .join("\n");

  return [
    openclawContext,
    "",
    "# JIGANYUSI EXECUTION RULES",
    "- Baca konteks yang tersedia sebelum menjawab.",
    "- Jangan mengaku membaca file/repo jika file itu tidak ada pada konteks FILE YANG TERBACA.",
    "- Jika Mentor memberi API/URL/provider baru, jangan bertanya detail yang bisa dicari. Gunakan search provider jika tersedia, lalu simpulkan langkah koneksi.",
    "- Jika Mentor meminta perubahan kode, jawab dengan file yang perlu diubah dan alasan singkat. Jangan menambah file/folder jika fungsi sudah ada.",
    "- Jika perlu tindakan sensitif seperti menyimpan secret, commit, deploy, atau ubah repo, minta persetujuan singkat dari Mentor sebelum eksekusi.",
    "- Jika pertanyaan pendek seperti 'lanjut', 'gimana', 'kenapa', hubungkan dengan percakapan di Room aktif.",
    "- Eksekusi dulu jika konteks cukup; jelaskan setelahnya seperlunya.",
    "- Jawab singkat, jelas, dan tidak muter-muter.",
    "",
    "# ROUTING SKILL TERDETEKSI",
    routedSkills || "Core OpenClaw saja.",
    "",
    "# PERCAKAPAN TERAKHIR DI ROOM",
    conversation || "Belum ada.",
    "",
    "# INPUT TERBARU MENTOR",
    userText,
    "",
    "Gunakan Bahasa Indonesia.",
  ].join("\n");
}

export function buildBrainResponse(providerResult) {
  if (!providerResult.ok) return providerResult.text;
  return providerResult.text;
}
