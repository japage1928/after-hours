function baseUrl() {
  return (process.env.N8N_WEBHOOK_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

export function hasN8nBackend() {
  return Boolean(baseUrl());
}

export async function postN8nJson<T>(action: string, payload: unknown, timeoutMs = 120000): Promise<T> {
  const base = baseUrl();
  if (!base) throw new Error("n8n backend is not configured.");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "x-mashup-pro-client": "netlify-server",
  };
  const secret = (process.env.N8N_WEBHOOK_SECRET ?? "").trim();
  if (secret) headers["x-mashup-pro-secret"] = secret;

  const response = await fetch(`${base}/${action}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || data == null) {
    throw new Error(data?.error || `n8n ${action} failed (${response.status}).`);
  }
  return data;
}
