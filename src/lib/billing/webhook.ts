import type Stripe from "stripe";
import {
  markCheckoutComplete,
  markPaymentFailed,
  upsertSubscriptionFromStripe,
} from "@/lib/billing/checkout";
import { getStripe } from "@/lib/billing/stripe";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/billing/usage";

export async function constructStripeEvent(
  rawBody: string,
  signature: string | null,
): Promise<Stripe.Event> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      await markCheckoutComplete(session);
      if (session.mode === "subscription" && session.subscription) {
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const sub = await getStripe().subscriptions.retrieve(subId);
        await upsertSubscriptionFromStripe(sub as never);
      }
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await markCheckoutComplete({ ...session, status: "expired" });
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscriptionFromStripe(sub as never);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const sql = await getSql();
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;
      let userId: string | null = null;
      if (customerId) {
        const rows = await sql<{ user_id: string }>`
          select user_id from billing_customer
          where stripe_customer_id = ${customerId}
        `;
        userId = rows[0]?.user_id ?? null;
      }
      await sql`
        insert into billing_payment (
          id, user_id, kind, status, plan_id, amount_cents, currency,
          stripe_invoice_id, failure_message, updated_at
        ) values (
          ${newId("pay")},
          ${userId},
          ${"invoice"},
          ${"failed"},
          ${null},
          ${invoice.amount_due ?? 0},
          ${invoice.currency ?? "usd"},
          ${invoice.id},
          ${invoice.last_finalization_error?.message ?? "Invoice payment failed"},
          CURRENT_TIMESTAMP
        )
        on conflict (id) do nothing
      `;
      await markPaymentFailed({
        invoiceId: invoice.id,
        message: invoice.last_finalization_error?.message ?? "Invoice payment failed",
      });
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const sql = await getSql();
      await sql`
        update billing_payment set
          status = ${"complete"},
          failure_message = null,
          updated_at = CURRENT_TIMESTAMP
        where stripe_invoice_id = ${invoice.id}
      `;
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await markPaymentFailed({
        paymentIntentId: pi.id,
        message: pi.last_payment_error?.message ?? "Payment intent failed",
      });
      break;
    }
    default:
      break;
  }
}
