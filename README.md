# CupMaster

Cloud 4-2 copies explicitly reviewed local data to Neon with recoverable checkpoints and remote verification. Product runtime remains Local and retains local records. Cloud 5 is reserved for continuous synchronization.

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

Open `http://localhost:3000`. The Local MVP uses versioned LocalStorage repositories and can run without cloud configuration.

For cloud authentication and migration, configure `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` in `.env.local` and run `npm run db:migrate` against the Neon database. See [authentication](docs/auth.md) and the [cloud data contract](docs/cloud-data-contract.md).

Start with [product architecture](docs/product-architecture.md) and [vertical slices](docs/vertical-slices.md).

Development migration QA is available at `/dev/migration-qa`. Follow [remote migration smoke QA](docs/remote-migration-smoke-qa.md); only the signed-in user may authorize real writes from `/migration`. Never place credentials or account identifiers in QA notes.
