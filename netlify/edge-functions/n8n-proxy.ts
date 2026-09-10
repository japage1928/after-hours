import { requireAccount } from "./_shared/require-account.ts";
const PREFIX = "/api/orchestrate/";
const ALLOWED = new Set(["song-plan", "song", "remix", "mashup", "status"]);

function cleanBase(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export default async function n8nProxy(request: Request) {
  const denied = await requireAccount(request);
  if (denied) return denied;
  const base = cleanBase(Netlify.env.get("N8N_WEBHOOK_BASE_URL") ?? "");
  if (!base) {
    return Response.json(
      { error: "n8n backend is not configured." },
      { status: 503, headers: { "x-mashup-backend": "unconfigured" } },
    );
  }

  const pathname = new URL(request.url).pathname;
  const action = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length).split("/")[0] : "";
  if (!ALLOWED.has(action)) {
    return Response.json({ error: "Unknown orchestration route." }, { status: 404 });
  }

  const incoming = new URL(request.url);
  const target = new URL(`${base}/${action}`);
  incoming.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", "application/json");
  headers.set("x-mashup-pro-client", "netlify");

  const sharedSecret = (Netlify.env.get("N8N_WEBHOOK_SECRET") ?? "").trim();
  if (sharedSecret) headers.set("x-mashup-pro-secret", sharedSecret);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "follow",
    });

    const responseHeaders = new Headers();
    responseHeaders.set("content-type", upstream.headers.get("content-type") ?? "application/json");
    responseHeaders.set("x-mashup-backend", "n8n");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not reach n8n." },
      { status: 502, headers: { "x-mashup-backend": "n8n" } },
    );
  }
}

export const config = {
  path: "/api/orchestrate/*",
};
