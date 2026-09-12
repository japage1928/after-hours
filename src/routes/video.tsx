import { createFileRoute, Navigate } from "@tanstack/react-router";
import { VideoApp } from "@/components/video-app";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/video")({
  component: VideoStudioPage,
});

function VideoStudioPage() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-muted">
        Opening video…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: "/video" }} />;
  }

  return <VideoApp />;
}
