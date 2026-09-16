# CupMaster

Cloud status: Cloud 4-2 provides an explicit, fingerprint-bound Local-to-Supabase copy with recoverable checkpoints and remote verification. Product runtime remains Local, Local data is retained, and automatic sync has not started. Cloud 5 is reserved for continuous synchronization.

CupMaster is a mobile-first AI pour-over coffee coach PWA. It helps people start a brew immediately with recipe defaults, follow clear guidance, save the cup, and improve later.

## Development

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

Open `http://localhost:3000`. The Local MVP continues to use versioned LocalStorage repositories and works without Supabase environment variables.

Optional cloud Auth uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. If either is absent, Auth reports unavailable and the Local MVP remains usable.

Client bundles read these values through the complete static references `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, as required by Next.js environment inlining.

Cloud 2 adds optional email/password Auth, session recovery, safe minimal profile bootstrap, and `/auth`. LocalStorage remains the runtime source and signing in does not sync or migrate local data. See [authentication](docs/auth.md), [cloud data contract](docs/cloud-data-contract.md), [Supabase security](docs/supabase-security.md), and [Supabase workflow](supabase/README.md).

Signup requiring email confirmation shows an independent Account created screen, keeps only the submitted email in transient UI state, supports SDK-based resend, and leaves Local Mode available. Cloud 3 remains unstarted.

Start with [product architecture](docs/product-architecture.md) and [vertical slices](docs/vertical-slices.md).

Development migration QA is available at `/dev/migration-qa`. Follow [remote migration smoke QA](docs/remote-migration-smoke-qa.md); only the signed-in user may authorize real writes from `/migration`. Never place credentials or account identifiers in QA notes.
