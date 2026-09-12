import { isAdminEmail } from "@/lib/auth/admin";
import { auth } from "@/lib/auth/server";
import { getRequest } from "@tanstack/react-start/server";
import {
  estimateLyricsCostCents,
  estimateMixCostCents,
  estimateVideoCostCents,
  estimateVocalCostCents,
  getEntitlement,
  hasOpenSongBundle,
  recordUsage,
  refundUsage,
  type UsageRecord,
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
    "Buy a song credit or start a plan to generate or remix with AI."
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
    description: "AI song generation (ACE-Step)",
    preferSongCredit: true,
  });
}

/** Reserve one AI job before Grok Imagine runs. Refund if QA/render fails. */
export async function chargeAfterVideo(
  userId: string,
  durationSec: number,
): Promise<UsageRecord | null> {
  if (process.env.VITE_AUTH_ENABLED === "false" || userId === "dev-user") {
    return null;
  }
  const email = await currentUserEmail(userId);
  if (isAdminEmail(email)) return null;
  const seconds = Math.round(Math.min(15, Math.max(1, durationSec)));
  return recordUsage({
    userId,
    kind: "mix_plan",
    amountCents: estimateVideoCostCents(seconds),
    description: `AI video generation (Grok Imagine, ${seconds}s)`,
    preferSongCredit: true,
  });
}

export async function refundUsageRecord(
  userId: string,
  record: UsageRecord | null,
): Promise<void> {
  if (!record) return;
  try {
    await refundUsage({ userId, record });
  } catch {
    /* best-effort — never hide the original generate/QA error */
  }
}
