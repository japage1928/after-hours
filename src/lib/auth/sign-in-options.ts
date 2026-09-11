import { createServerFn } from "@tanstack/react-start";
import {
  GROK_PROVIDERS,
  nativeSocialProvidersFromEnv,
  type NativeSocialId,
} from "@/lib/auth/providers";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";

export type SignInOptions = {
  emailPassword: boolean;
  /** Broker-mediated Google / Facebook / X (only when safe for this host). */
  broker: Array<{ providerId: string; label: string }>;
  /** Direct Better Auth social providers with server credentials. */
  native: Array<{ id: NativeSocialId; label: string }>;
  /** Callback URIs to register in each OAuth console. */
  callbackHints: {
    google: string;
    facebook: string;
    twitter: string;
  };
};

export const getSignInOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<SignInOptions> => {
    // Dynamic import keeps Better Auth / pg out of the browser bundle.
    const { brokerOAuthEnabled } = await import("@/lib/auth/server");
    const { appOrigin } = await import("@/lib/billing/stripe");
    const origin = appOrigin().replace(/\/+$/, "");
    return {
      emailPassword: emailAndPasswordEnabled,
      broker: brokerOAuthEnabled
        ? GROK_PROVIDERS.map((p) => ({
            providerId: p.providerId,
            label: p.label,
          }))
        : [],
      native: nativeSocialProvidersFromEnv(),
      callbackHints: {
        google: `${origin}/api/auth/callback/google`,
        facebook: `${origin}/api/auth/callback/facebook`,
        twitter: `${origin}/api/auth/callback/twitter`,
      },
    };
  },
);
