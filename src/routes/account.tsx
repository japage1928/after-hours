import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AccountShell, AccountPanel } from "@/components/account-pages";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: "/account" }} />;
  }

  return (
    <AccountShell active="/account">
      <AccountPanel />
    </AccountShell>
  );
}
