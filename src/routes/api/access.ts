import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { requireActiveAccount } from "@/lib/auth/account-access.server";

export const Route = createFileRoute("/api/access")({ server: { handlers: {
  GET: async ({ request }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user) return Response.json({ error: "Sign in to use Mashup Pro." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      const account = await requireActiveAccount(session.user.id);
      return Response.json(account, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error && error.status === 403 ? 403 : 503;
      return Response.json({ error: status === 403 ? "Your account is suspended." : "Account access is unavailable. Please try again." }, { status, headers: { "Cache-Control": "no-store" } });
    }
  },
} } });
