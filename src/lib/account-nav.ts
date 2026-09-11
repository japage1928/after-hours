export const ACCOUNT_PAGES = [
  { path: "/settings", label: "Settings" },
  { path: "/projects", label: "Library" },
  { path: "/profile", label: "Profile" },
  { path: "/account", label: "Account" },
  { path: "/billing", label: "Billing" },
] as const;

export type AccountPagePath = (typeof ACCOUNT_PAGES)[number]["path"];
