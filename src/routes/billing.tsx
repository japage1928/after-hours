import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AccountShell, BillingPanel } from "@/components/account-pages";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/billing")({
  component: BillingPage,
});

function BillingPage() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: "/billing" }} />;
  }

  return (
    <AccountShell active="/billing">
      <BillingPanel />
    </AccountShell>
  );
}
