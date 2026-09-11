import { createFileRoute } from "@tanstack/react-router";
import { constructStripeEvent, handleStripeEvent } from "@/lib/billing/webhook";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const signature = request.headers.get("stripe-signature");
        const rawBody = await request.text();
        try {
          const event = await constructStripeEvent(rawBody, signature);
          await handleStripeEvent(event);
          return Response.json({ received: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Webhook error";
          console.error("[stripe webhook]", message);
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
