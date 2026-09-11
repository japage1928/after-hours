import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AccountShell, SupportPanel } from "@/components/account-pages";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/support")({
  component: SupportPage,
});

function SupportPage() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: "/support" }} />;
  }

  return (
    <AccountShell active="/support">
      <SupportPanel />
    </AccountShell>
  );
}
