const REPLICATE_FILES_URL = "https://api.replicate.com/v1/files";

export default async function stemUpload(request: Request) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const token = Netlify.env.get("REPLICATE_API_TOKEN");
  if (!token) return Response.json({ error: "Stem separation is not configured." }, { status: 503 });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return Response.json({ error: "Expected multipart audio upload." }, { status: 400 });
  }

  try {
    // Rebuild the multipart payload inside the Edge Function instead of forwarding
    // the browser's request stream verbatim. This avoids upstream failures caused by
    // chunked multipart bodies/boundaries being proxied through the edge runtime.
    const incoming = await request.formData();
    const content = incoming.get("content");
    if (!(content instanceof File)) {
      return Response.json({ error: "No audio file was received." }, { status: 400 });
    }
    if (content.size > 20 * 1024 * 1024) {
      return Response.json({ error: "Keep each track under 20 MB." }, { status: 413 });
    }

    const form = new FormData();
    form.append("content", content, content.name || "track-audio");
    form.append("metadata", JSON.stringify({ source: "mashup-pro" }));

    const upstream = await fetch(REPLICATE_FILES_URL, {
      method: "POST",
      headers: { Authorization: `Token ${token}` },
      body: form,
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { detail?: string; error?: string; message?: string };
        detail = parsed.detail || parsed.error || parsed.message || text;
      } catch {
        /* keep raw text */
      }
      return Response.json(
        { error: `Replicate upload failed (${upstream.status})${detail ? `: ${String(detail).slice(0, 300)}` : ""}` },
        { status: upstream.status },
      );
    }

    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not upload audio for separation." },
      { status: 502 },
    );
  }
}

export const config = {
  path: "/api/stem-upload",
  rateLimit: { windowSize: 60, windowLimit: 12, aggregateBy: ["ip"] },
};
