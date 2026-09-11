/** Owner inbox — full ticket UI can land from a separate PR. */
export const SUPPORT_EMAIL = "japage628@gmail.com";

export function supportMailto(subject = "After Hours help"): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
