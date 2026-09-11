import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  AccountShell,
  SettingsPanel,
} from "@/components/account-pages";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const LEGACY_TABS = [
  "settings",
  "projects",
  "profile",
  "account",
  "billing",
  "support",
] as const;

const settingsSearchSchema = z.object({
  tab: z.enum(LEGACY_TABS).optional(),
});

export const Route = createFileRoute("/settings")({
  validateSearch: (search) => settingsSearchSchema.parse(search),
  component: SettingsPage,
});

function SettingsPage() {
  const { tab } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();

  if (tab && tab !== "settings") {
    return <Navigate to={`/${tab}`} />;
  }

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: "/settings" }} />;
  }

  return (
    <AccountShell active="/settings">
      <SettingsPanel />
    </AccountShell>
  );
}
