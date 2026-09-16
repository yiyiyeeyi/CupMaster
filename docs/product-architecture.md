# Product Architecture

Cloud 4-1 adds an authenticated Migration Review route that reads only through the fixed Local runtime bundle. It summarizes local records, reuses graph validation, and collects warnings; consent is transient UI state and does not start migration or create a checkpoint. Runtime remains Local. Cloud 4-2 will implement explicit migration; Cloud 5 will implement synchronization.

Cloud 4-2 implements an explicit, retryable one-time copy with checkpoint persistence, conflict preflight, two-phase references, and remote verification. Completion still leaves product runtime Local and does not imply synchronization; Cloud 5 has not started.

Cloud 3-2 adds a composition root and migration-readiness contracts without activating cloud persistence. Auth mode and repository mode are independent; runtime is a compile-time `local` literal. Local, authenticated Remote, and dependency-only Migration bundles share one construction boundary.

Cloud 3-1 adds inactive async Supabase repository infrastructure beneath the existing mapper and RLS boundary. Local repositories remain wired to every use case.

Cloud 2 adds an optional account boundary. A session means an account is connected, not that local Profile, Brew, Plan, or Snapshot data is synced. Local Mode retains the MVP, Auth Provider stays separate from local Profile Provider, and no root auth guard is introduced.

Cloud 1 is infrastructure-only. Local repositories remain the active MVP persistence layer; Supabase clients are lazy and unused by product routes. Auth, remote repositories, migration, sync, and conflict resolution remain later cloud increments.

CupMaster is an AI pour-over coach, not a recipe collection or a database that demands complete setup before brewing. The core loop is start quickly → follow the guide → save the Brew → reflect later → use a focused next plan.

## Principles
1. Start first; progressively collect detail.
2. Brew persistence is independent from Feedback and optional AI Analysis.
3. Teach equipment choice and lower the entry barrier for beginners.

## Modules
- **Start:** Quick Brew, Choose Recipe, Continue Brew, Brew Again, Use Next Plan.
- **Guide:** Recipe, Quick Prepare, Manual Live Brew, Timer, target weight, pour stage/pattern; camera/OCR/AR are later.
- **Reflect:** Brew Complete, summary, feedback, optional AI, Ask AI, Next Plan.
- **Remember:** Journal, details, drafts, awaiting feedback, histories, Brew Again.
- **Equip:** Gear Guide, Beginner Setup, My Gear, grinder settings, calibration. Gear Guide teaches; My Gear records ownership.

The first delivery path completes and saves a first cup without Bean, full equipment, feedback, or AI.

## Onboarding v1
1. **Display Name:** name or nickname, never require legal name and never write “Master” into the stored value. It may personalize welcome copy.
2. **Experience Level:** `beginner`（我剛開始接觸手沖）, `developing`（我已經會沖，但結果不太穩定）, `intermediate`（我會調整參數，想進一步改善）, or `advanced`（我有較多經驗，想記錄與比較不同方案）.
3. **Current Needs:** multi-select `gear_guidance`, `learn_basics`, `improve_consistency`, `find_recipe_for_bean`, `track_and_compare`, and `improve_flavor`.

Do not create complete Bean, Equipment, Flavor, or AI profiles during onboarding.

## Quick Prepare
This is a light confirmation, not a long form. Dose, total water, temperature, and dripper come from recipe defaults and may be overridden. Grind setting, Bean, and equipment notes are optional; Bean, grind, and My Gear may all be empty. The page says: **先開始沖，其他資料可以之後補上。** Confirming creates a BrewPlan and immutable Recipe Snapshot.
