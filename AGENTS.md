# CupMaster Engineering Guide

## Product goal and principles
CupMaster is a mobile-first AI pour-over coffee coach PWA. Its goal is to help someone start quickly, finish with guidance, then enrich the record and improve the next cup.

1. Let users start brewing before asking them to complete data.
2. A Brew can be saved before Feedback or AI Analysis exists.
3. Reduce the beginner's barrier to choosing gear and starting pour-over, not only the difficulty of brewing.

Organize product work into Start, Guide, Reflect, Remember, and Equip. Gear Guide teaches selection; My Gear represents owned equipment.

## Stack and structure
- Next.js App Router, React, TypeScript strict, Tailwind CSS, ESLint, npm only.
- Routes live only in `src/app`; shared UI in `src/components`; domain types and contracts in `src/domain`; documents in `docs`.
- Commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run start`.
- Do not use `any` or double assertions such as `as unknown as`.
- Prefer Server Components. Add `"use client"` only for browser APIs, local interaction, or client hooks; keep client boundaries small.
- Components consume repositories/services; they never access Supabase directly. Repositories isolate persistence; services own use-case orchestration.

## Product and safety invariants
- Never make Bean or Equipment a prerequisite for Start Brew.
- Never make Feedback or AI a prerequisite for Save Brew.
- Every Brew owns an immutable Recipe Snapshot; later Recipe edits must not rewrite history.
- Never put secret API keys in `NEXT_PUBLIC_*`. A public Supabase publishable key is the only planned exception; service-role and AI keys stay server-only.
- Do not change product flows without explicit approval. Implement one vertical slice at a time; the first is completing the first cup, not Collection.
- Do not automatically commit or push.
- Every work round runs lint, typecheck, tests when a test script exists, and build.
