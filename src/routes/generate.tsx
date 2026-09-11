import { createFileRoute, Navigate } from "@tanstack/react-router";
import { StudioApp } from "@/components/studio-app";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/generate")({
  component: GenerateBooth,
});

function GenerateBooth() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Opening the booth…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: "/generate" }} />;
  }

  return <StudioApp mode="generate" />;
}
