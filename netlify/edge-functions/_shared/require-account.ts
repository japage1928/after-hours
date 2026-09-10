/** Validate the real application session before forwarding to a paid backend. */
export async function requireAccount(request: Request): Promise<Response | null> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const headers = new Headers();
  for (const name of ["cookie", "authorization"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (![...headers.keys()].length) return Response.json({ error: "Sign in to use Mashup Pro." }, { status: 401 });
  try {
    const access = await fetch(new URL("/api/access", request.url), { headers, redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!access.ok) return new Response(access.body, { status: access.status, headers: { "content-type": "application/json", "Cache-Control": "no-store" } });
    const account = await access.json();
    if (!account?.id || account.status !== "active" || !["member", "admin"].includes(account.role)) {
      return Response.json({ error: "Account verification failed." }, { status: 503 });
    }
    return null;
  } catch {
    return Response.json({ error: "Cannot verify account access. Please retry." }, { status: 503 });
  }
}
