import { isAdminEmail } from "@/lib/auth/admin";
import { auth } from "@/lib/auth/server";
import { getRequest } from "@tanstack/react-start/server";
import {
  estimateLyricsCostCents,
  estimateMixCostCents,
  estimateVocalCostCents,
  getEntitlement,
  hasOpenSongBundle,
  recordUsage,
} from "@/lib/billing/usage";

export async function currentUserEmail(
  userId: string,
): Promise<string | null> {
  const request = getRequest();
  if (!request) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user?.id === userId) return session.user.email ?? null;
  return null;
}

/**
 * Gate AI features behind free monthly quota, subscription weekly batch,
 * song credit, or admin allowlist.
 *
 * `allowSongBundle` is for the lyrics→vocal chain only. An open song bundle
 * must not unlock unpaid AI mix plans.
 */
export async function assertAiAllowed(
  userId: string,
  opts?: { allowSongBundle?: boolean },
): Promise<string | null> {
  if (process.env.VITE_AUTH_ENABLED === "false" || userId === "dev-user") {
    return null;
  }
  const email = await currentUserEmail(userId);
  if (isAdminEmail(email)) return null;
  if (opts?.allowSongBundle && (await hasOpenSongBundle(userId))) return null;
  const entitlement = await getEntitlement(userId);
  if (entitlement.ok) return null;
  return (
    entitlement.reason ??
    "Buy a mix credit or start a plan to use AI DJ planning."
  );
}

export async function chargeAfterLyrics(userId: string): Promise<void> {
  if (process.env.VITE_AUTH_ENABLED === "false" || userId === "dev-user") return;
  const email = await currentUserEmail(userId);
  if (isAdminEmail(email)) return;
  if (await hasOpenSongBundle(userId)) return;
  await recordUsage({
    userId,
    kind: "song_lyrics",
    amountCents: estimateLyricsCostCents(),
    description: "Song lyrics generation",
    preferSongCredit: true,
  });
}

export async function chargeAfterVocal(
  userId: string,
  text: string,
): Promise<void> {
  if (process.env.VITE_AUTH_ENABLED === "false" || userId === "dev-user") return;
  const email = await currentUserEmail(userId);
  if (isAdminEmail(email)) return;
  if (await hasOpenSongBundle(userId)) return;
  await recordUsage({
    userId,
    kind: "song_vocal",
    amountCents: estimateVocalCostCents(text),
    description: "Song vocal render",
    preferSongCredit: true,
  });
}

export async function chargeAfterMix(userId: string): Promise<void> {
  if (process.env.VITE_AUTH_ENABLED === "false" || userId === "dev-user") return;
  const email = await currentUserEmail(userId);
  if (isAdminEmail(email)) return;
  await recordUsage({
    userId,
    kind: "mix_plan",
    amountCents: estimateMixCostCents(),
    description: "AI mash/remix plan",
    preferSongCredit: true,
  });
}
