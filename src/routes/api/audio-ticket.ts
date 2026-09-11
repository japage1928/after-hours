import { createHash, randomBytes } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { requireActiveAccount } from "@/lib/auth/account-access.server";
import { getSql } from "@/lib/db";

// Public infrastructure URL, not a credential. The gateway itself requires a
// short-lived bearer ticket issued here after a real Mashup Pro session check.
const AUDIO_BACKEND_URL =
  "https://br-odd-fog-ayzn00dx-mashupaudio.compute.c-5.us-east-2.aws.neon.tech";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export const Route = createFileRoute("/api/audio-ticket")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) {
          return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
        }

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user) {
            return Response.json({ error: "Sign in to use Mashup Pro." }, { status: 401 });
          }
          await requireActiveAccount(session.user.id);

          const token = randomBytes(32).toString("base64url");
          const tokenHash = createHash("sha256").update(token).digest("hex");
          const sql = await getSql();

          await sql.query("delete from audio_tickets where expires_at <= now() or (user_id = $1 and created_at < now() - interval '10 minutes')", [session.user.id]);
          const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
          await sql.query(
            "insert into audio_tickets(token_hash,user_id,expires_at) values($1,$2,$3::timestamptz)",
            [tokenHash, session.user.id, expiresAt],
          );

          return Response.json(
            { token, expiresAt, backendUrl: AUDIO_BACKEND_URL },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error && error.status === 403
              ? 403
              : 503;
          return Response.json(
            {
              error:
                status === 403
                  ? "Your account is suspended."
                  : "Audio access is unavailable. Please retry.",
            },
            { status, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
