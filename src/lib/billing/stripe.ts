import Stripe from "stripe";

let stripeSingleton: Stripe | null | undefined;

export function stripeConfigured(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

/** Server-only Stripe client. Throws if `STRIPE_SECRET_KEY` is missing. */
export function getStripe(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Stripe {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY (and run npm run stripe:setup).",
    );
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
    });
  }
  return stripeSingleton;
}

export function appOrigin(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const fromAuth = env.BETTER_AUTH_URL?.trim()?.replace(/\/+$/, "");
  if (fromAuth) return fromAuth;
  const fromPublic = env.VITE_APP_URL?.trim()?.replace(/\/+$/, "");
  if (fromPublic) return fromPublic;
  return "http://localhost:8080";
}
