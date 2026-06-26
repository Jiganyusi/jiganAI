import { handleTelegramUpdate } from "./runtime/main.js";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Jiganyusi Worker aktif.", { status: 200 });
    }

    const update = await request.json().catch(() => null);

    if (!update) {
      return new Response("OK", { status: 200 });
    }

    await handleTelegramUpdate(update, env);

    return new Response("OK", { status: 200 });
  },
};
