# Product Architecture

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
