/** Stripe Checkout returns here so the meter can refresh on a Generate screen. */
export const CHECKOUT_SUCCESS_PATH = "/generate";

export function checkoutSuccessUrl(origin: string): string {
  return `${origin}${CHECKOUT_SUCCESS_PATH}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
}

export function checkoutCancelUrl(origin: string): string {
  return `${origin}/pricing?checkout=cancel`;
}

/** True when the current URL is a returning Stripe Checkout success. */
export function isCheckoutSuccessSearch(search: string): boolean {
  try {
    return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("checkout") === "success";
  } catch {
    return false;
  }
}

/**
 * Strip checkout query params after we've toasted / refreshed usage.
 * Returns the cleaned path+search, or null if this wasn't a checkout return.
 */
export function consumeCheckoutSuccessLocation(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("checkout") !== "success") return null;
  params.delete("checkout");
  params.delete("session_id");
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
