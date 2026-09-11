/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * Enabled so the site owner can create / sign in with japage628@gmail.com
 * without needing Grok-broker OAuth credentials on the Vercel domain.
 * Forms live on `/login` via `authClient.signUp.email` / `signIn.email`.
 *
 * Do NOT edit `server.ts` for this — that file is frozen pre-wired config.
 */
export const emailAndPasswordEnabled = true;
