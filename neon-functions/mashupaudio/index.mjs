const REPLICATE_FILES_URL = "https://api.replicate.com/v1/files";
const REPLICATE_PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";
const DEMUCS_VERSION = "25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953";

function cleanOrigin(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

function normalizeToken(raw) {
  return (raw || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^Token\s+/i, "")
    .replace(/^['\"]|['\"]$/g, "")
    .trim();
}

function corsHeaders(origin) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(body, status, origin) {
  const headers = corsHeaders(origin);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

async function verifyTicket(request, appOrigin) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return false;
  const response = await fetch(`${appOrigin}/api/audio-ticket/verify`, {
    method: "POST",
    headers: { authorization, "x-mashup-audio-gateway": "neon" },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  return Boolean(response?.ok);
}

function upstreamResponse(upstream, origin) {
  const headers = corsHeaders(origin);
  headers.set(
    "content-type",
    upstream.headers.get("content-type") || "application/json",
  );
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request) {
    const appOrigin = cleanOrigin(process.env.APP_ORIGIN);
    const requestOrigin = cleanOrigin(request.headers.get("origin"));
    const allowedOrigin =
      requestOrigin && requestOrigin === appOrigin ? requestOrigin : "";

    if (request.method === "OPTIONS") {
      if (!appOrigin || requestOrigin !== appOrigin) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin),
      });
    }

    if (!appOrigin) {
      return json({ error: "Audio gateway origin is not configured." }, 503, "");
    }
    if (requestOrigin && requestOrigin !== appOrigin) {
      return json({ error: "Origin is not allowed." }, 403, "");
    }

    const verified = await verifyTicket(request, appOrigin);
    if (!verified) {
      return json(
        { error: "Audio authorization expired. Please retry." },
        401,
        allowedOrigin,
      );
    }

    const replicateToken = normalizeToken(process.env.REPLICATE_API_TOKEN);
    if (!replicateToken) {
      return json(
        { error: "Stem separation is not configured." },
        503,
        allowedOrigin,
      );
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/upload" && request.method === "POST") {
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
          return json(
            { error: "Expected multipart audio upload." },
            400,
            allowedOrigin,
          );
        }
        const incoming = await request.formData();
        const content = incoming.get("content");
        if (!(content instanceof File)) {
          return json(
            { error: "No audio file was received." },
            400,
            allowedOrigin,
          );
        }
        if (content.size > 20 * 1024 * 1024) {
          return json(
            { error: "Keep each track under 20 MB." },
            413,
            allowedOrigin,
          );
        }

        const form = new FormData();
        form.append("content", content, content.name || "track-audio");
        form.append("metadata", JSON.stringify({ source: "mashup-pro" }));

        const upstream = await fetch(REPLICATE_FILES_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${replicateToken}` },
          body: form,
          signal: AbortSignal.timeout(120000),
        });
        return upstreamResponse(upstream, allowedOrigin);
      }

      if (path === "/prediction" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        const audio = body && typeof body.audio === "string" ? body.audio : "";
        if (!audio.startsWith("https://api.replicate.com/v1/files/")) {
          return json(
            { error: "A Replicate file URL is required." },
            400,
            allowedOrigin,
          );
        }
        const upstream = await fetch(REPLICATE_PREDICTIONS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${replicateToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            version: DEMUCS_VERSION,
            input: {
              audio,
              model_name: "htdemucs",
              shifts: 1,
              overlap: 0.25,
              clip_mode: "rescale",
              output_format: "mp3",
              mp3_bitrate: 320,
            },
          }),
          signal: AbortSignal.timeout(30000),
        });
        return upstreamResponse(upstream, allowedOrigin);
      }

      if (path === "/prediction" && request.method === "GET") {
        const id = url.searchParams.get("id") || "";
        if (!/^[a-zA-Z0-9_-]{6,80}$/.test(id)) {
          return json({ error: "Invalid prediction id." }, 400, allowedOrigin);
        }
        const upstream = await fetch(
          `${REPLICATE_PREDICTIONS_URL}/${encodeURIComponent(id)}`,
          {
            headers: { Authorization: `Bearer ${replicateToken}` },
            signal: AbortSignal.timeout(30000),
          },
        );
        return upstreamResponse(upstream, allowedOrigin);
      }

      return json({ error: "Not found." }, 404, allowedOrigin);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Audio gateway request failed.",
        },
        502,
        allowedOrigin,
      );
    }
  },
};
