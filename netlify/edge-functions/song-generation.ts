import { requireAccount } from "./_shared/require-account.ts";
const REPLICATE_PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";
const ACE_STEP_VERSION = "fishaudio/ace-step-1.5:74e3a7d383b18815e277de5223f5fe9d53d38832de15aa567fe729fa129d0d85";

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export default async function songGeneration(request: Request) {
  const denied = await requireAccount(request);
  if (denied) return denied;
  const token = Netlify.env.get("REPLICATE_API_TOKEN");
  if (!token) return Response.json({ error: "Music generation is not configured." }, { status: 503 });

  try {
    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as {
        prompt?: string;
        lyrics?: string;
        duration?: number;
        bpm?: number;
        keyScale?: string;
      } | null;
      if (!body?.prompt?.trim()) return Response.json({ error: "A music prompt is required." }, { status: 400 });

      const duration = Math.max(15, Math.min(600, Number(body.duration) || 90));
      const bpm = Number.isFinite(body.bpm) ? Math.max(30, Math.min(300, Number(body.bpm))) : undefined;
      const input: Record<string, unknown> = {
        seed: -1,
        shift: 3,
        lyrics: (body.lyrics || "[Instrumental]").slice(0, 4096),
        prompt: body.prompt.slice(0, 512),
        duration,
        thinking: true,
        key_scale: (body.keyScale || "").slice(0, 32),
        batch_size: 1,
        audio_format: "mp3",
        guidance_scale: 7,
        time_signature: "auto",
        inference_steps: 8,
      };
      if (bpm) input.bpm = bpm;

      const upstream = await fetch(REPLICATE_PREDICTIONS_URL, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ version: ACE_STEP_VERSION, input }),
      });
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      });
    }

    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("id") ?? "";
      if (!/^[a-zA-Z0-9_-]{6,80}$/.test(id)) return Response.json({ error: "Invalid prediction id." }, { status: 400 });
      const upstream = await fetch(`${REPLICATE_PREDICTIONS_URL}/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Music generation request failed." },
      { status: 502 },
    );
  }
}

export const config = {
  path: "/api/song-generation",
};
