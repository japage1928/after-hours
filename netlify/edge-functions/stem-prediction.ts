import { requireAccount } from "./_shared/require-account.ts";
const REPLICATE_PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";
const DEMUCS_VERSION = "25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953";

function normalizeToken(raw: string): string {
  return raw
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^Token\s+/i, "")
    .replace(/^['\"]|['\"]$/g, "")
    .trim();
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export default async function stemPrediction(request: Request) {
  const denied = await requireAccount(request);
  if (denied) return denied;
  const rawToken = Netlify.env.get("REPLICATE_API_TOKEN") ?? "";
  const token = normalizeToken(rawToken);
  if (!token) return Response.json({ error: "Stem separation is not configured." }, { status: 503 });

  try {
    if (request.method === "POST") {
      const body = await request.json().catch(() => null) as { audio?: string } | null;
      if (!body?.audio || !body.audio.startsWith("https://api.replicate.com/v1/files/")) {
        return Response.json({ error: "A Replicate file URL is required." }, { status: 400 });
      }

      const upstream = await fetch(REPLICATE_PREDICTIONS_URL, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          version: DEMUCS_VERSION,
          input: {
            audio: body.audio,
            model_name: "htdemucs",
            shifts: 1,
            overlap: 0.25,
            clip_mode: "rescale",
            output_format: "mp3",
            mp3_bitrate: 320,
          },
        }),
      });
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      });
    }

    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("id") ?? "";
      if (!/^[a-zA-Z0-9_-]{6,80}$/.test(id)) {
        return Response.json({ error: "Invalid prediction id." }, { status: 400 });
      }
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
      { error: error instanceof Error ? error.message : "Stem separation request failed." },
      { status: 502 },
    );
  }
}

export const config = {
  path: "/api/stem-prediction",
  rateLimit: { windowSize: 60, windowLimit: 24, aggregateBy: ["ip"] },
};
