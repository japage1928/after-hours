import { createFileRoute } from "@tanstack/react-router";
import { StudioApp } from "@/components/studio-app";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Opening the booth…
      </div>
    );
  }

  if (!user) {
    return <RedirectToSignIn />;
  }

  return <StudioApp />;
}
