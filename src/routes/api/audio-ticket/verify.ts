import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? "";
}

export const Route = createFileRoute("/api/audio-ticket/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token || token.length > 128) {
          return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
        }

        try {
          const hash = createHash("sha256").update(token).digest("hex");
          const sql = await getSql();
          const rows = await sql.query<{ user_id: string }>(
            `select t.user_id
               from audio_tickets t
               join account_controls c on c.user_id=t.user_id
              where t.token_hash=$1
                and t.expires_at > now()
                and c.status='active'
                and c.role in ('member','admin')
              limit 1`,
            [hash],
          );
          if (!rows[0]?.user_id) {
            return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
          }
          return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
