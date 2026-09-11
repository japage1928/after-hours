import type { BoothMode } from "@/lib/booth-mode";
import { isBoothMode } from "@/lib/booth-mode";

const DEFAULT_BOOTH_KEY = "after-hours.default-booth";

export function readDefaultBooth(): BoothMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEFAULT_BOOTH_KEY);
    return raw && isBoothMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeDefaultBooth(mode: BoothMode | null) {
  if (typeof window === "undefined") return;
  try {
    if (!mode) window.localStorage.removeItem(DEFAULT_BOOTH_KEY);
    else window.localStorage.setItem(DEFAULT_BOOTH_KEY, mode);
  } catch {
    /* ignore */
  }
}
