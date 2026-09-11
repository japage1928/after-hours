/** Fired after a successful ACE-Step job so the header meter can refetch. */
export const USAGE_CHANGED_EVENT = "after-hours:usage-changed";

export function bumpUsageMeter() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(USAGE_CHANGED_EVENT));
}
