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
    // Stream the browser's multipart body straight to Replicate. Do not buffer large songs in Netlify.
    const upstream = await fetch(REPLICATE_FILES_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": contentType,
      },
      body: request.body,
    });

    const body = await upstream.text();
    return new Response(body, {
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
