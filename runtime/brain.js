import { buildOpenClawContext, routeSkills } from "./openclaw.js";

export async function buildBrainPrompt(room, userText, env) {
  const conversation = (room?.percakapan || [])
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
    "- OpenClaw adalah sumber kemampuan. Jangan membuat kemampuan baru jika skill OpenClaw sudah mengatur cara berpikirnya.",
    "- Baca konteks Room dan file yang tersedia sebelum menjawab.",
    "- Jangan mengaku membaca file/repo jika file itu tidak ada di konteks.",
    "- Jika Mentor memberi API/URL/provider baru, gunakan search/provider jika tersedia; jangan bertanya detail yang bisa dicari sendiri.",
    "- Jika Mentor meminta perubahan kode, jawab berdasarkan file yang tersedia dan hindari tambah file/folder tanpa alasan nyata.",
    "- Jika perlu tindakan sensitif seperti menyimpan secret, commit, deploy, atau ubah repo, minta persetujuan singkat.",
    "- Jika pertanyaan pendek seperti 'lanjut', 'gimana', 'kenapa', hubungkan dengan percakapan di Room aktif.",
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
  if (!providerResult?.ok) return providerResult?.text || "AI Provider gagal tanpa pesan error.";
  return providerResult.text;
}
