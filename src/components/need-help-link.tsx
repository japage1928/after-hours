import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function NeedHelpLink({
  className,
  muted = true,
}: {
  className?: string;
  muted?: boolean;
}) {
  return (
    <Link
      to="/help"
      className={cn(
        "text-sm underline-offset-4 hover:underline",
        muted ? "text-muted hover:text-fg" : "text-fg/90",
        className,
      )}
    >
      Need help?
    </Link>
  );
}
