import { createFileRoute } from "@tanstack/react-router";
import { AccountGate } from "@/components/account-gate";
import { StudioApp } from "@/components/studio-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AccountGate><StudioApp /></AccountGate>;
}
