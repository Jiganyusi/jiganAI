import { buildOpenClawContext, routeSkills } from "./openclaw.js";

export async function buildBrainPrompt(room, userText, env) {
  const conversation = (room.percakapan || [])
    .map((item) => `${item.role}: ${item.text}`)
    .join("\n");

  const openclawContext = await buildOpenClawContext({ room, userText, env });
  const routedSkills = routeSkills(userText)
    .slice(0, 3)
    .map((skill) => `${skill.id}:${skill.domain}`)
    .join(", ");

  return [
    openclawContext,
    "",
    "# JIGANYUSI EXECUTION POLICY",
    "- Eksekusi dulu, jelaskan setelahnya jika diperlukan.",
    "- Jangan bertanya jika informasi yang diberikan Mentor sudah cukup untuk langkah pertama.",
    "- Jika Mentor memberi URL/API/provider baru, gunakan skill integrasi/API/AI untuk menyimpulkan langkah koneksi.",
    "- Jika perlu informasi terbaru/dokumentasi publik, gunakan hasil Search Provider bila tersedia.",
    "- Jika tidak punya akses tool tertentu, jelaskan satu kalimat lalu berikan jalur alternatif yang bisa dijalankan.",
    "- Jangan mengklaim sudah membaca repo/file kecuali konteks file itu memang dimuat dalam prompt.",
    "- Jika memberi perubahan kode, sebutkan file yang perlu diubah dan alasan singkatnya.",
    "- Jawab ringkas, tenang, dan langsung ke inti.",
    "",
    "# ROUTING SKILL SAAT INI",
    routedSkills || "Core OpenClaw saja.",
    "",
    "# PERCAKAPAN TERAKHIR DI ROOM",
    conversation || "Belum ada.",
    "",
    "# PERTANYAAN / PERINTAH TERBARU MENTOR",
    userText,
    "",
    "Gunakan Bahasa Indonesia.",
  ].join("\n");
}

export function buildBrainResponse(providerResult) {
  if (!providerResult.ok) return providerResult.text;
  return providerResult.text;
}
