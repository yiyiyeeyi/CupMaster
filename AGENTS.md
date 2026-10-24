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

## Product decisions and current scope
- Read `docs/product/product-decisions.md` before starting any work. It is the in-repo summary of decided product scope; the full PRD, numbered requirements (REQ-n), and status live in Notion (links in that file).
- Precedence: the user's latest explicit instruction → the invariants above → `docs/product/product-decisions.md` / Notion PRD → `design/` for layout and visual hierarchy → other `docs/` → current code. Obsolete design elements (five-tab nav, required Bean/equipment, AR/camera overlays, Collection-first, unimplemented AI/chat actions, fabricated measurements) are overridden by product rules.
- Current goal is V1: run one complete loop from onboarding through guided brewing, reflection, Next Try, and a second cup. Real-time trajectory judgement and coaching are V1.5. Vision (A-line) is a parallel research track and never blocks the main flow; when vision fails, timer, manual brewing, and saving must still work.
- Do not change the A/B coordinate contracts until a versioned decision is made.
- UI copy: Traditional Chinese for V1; brand names and canonical page names stay in English; keep copy in translatable strings.
- Record new product decisions in both Notion and `docs/product/product-decisions.md`; only the user finalizes product decisions.

## Multi-agent collaboration
Codex and Claude both work on this repository and may swap roles: one implements, the other reviews. Follow `docs/product/collaboration.md` for the plan → implement → handoff → review flow, the handoff and review templates, and the review checklist. Treat uncommitted files left by the other agent as valid work.
