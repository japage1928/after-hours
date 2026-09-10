# Mashup Pro account setup

This change requires a persistent PostgreSQL database before production rollout. The auth adapter and app queries accept DATABASE_URL, NETLIFY_DATABASE_URL, or NETLIFY_DATABASE_URL_UNPOOLED. The normal Netlify build applies migrations, including account controls and an audit table.

Configure BETTER_AUTH_URL=https://mashuppro.netlify.app, a stable random BETTER_AUTH_SECRET (at least 32 bytes), and VITE_AUTH_ENABLED=true. These are separate from the existing XAI, n8n, and Replicate settings. Keep secrets server-side. Preview deployments should use their own database and matching auth URL.

After the owner creates an email/password account, obtain its immutable ID from the user table and set MASHUP_ADMIN_USER_IDS to that ID in Netlify. Never select an owner by signup order or grant admin based on an unverified email. The /admin page supports searching accounts, suspending/reactivating users, changing roles, and revoking sessions. Owner IDs and the current administrator are protected from changes through that page.

Required login covers the main app, server actions, and the n8n/Replicate edge endpoints. Account status is rechecked for server requests and every 30 seconds in the open UI. Suspension revokes sessions; account changes are recorded atomically in account_audit. Existing audio already downloaded cannot be recalled.

Before merging, verify a production database is provisioned and test signup/signin, one owner account, one member account, and suspension on the Netlify preview. The current social-provider buttons use existing Grok OAuth configuration; email/password is enabled independently. Do not assume the shared sandbox OAuth client supports the production domain.
