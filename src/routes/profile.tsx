import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AccountShell, ProfilePanel } from "@/components/account-pages";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: "/profile" }} />;
  }

  return (
    <AccountShell active="/profile">
      <ProfilePanel />
    </AccountShell>
  );
}
