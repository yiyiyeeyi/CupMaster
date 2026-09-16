# Design System

The Local MVP browser walk compared all 19 files in `design/` with implemented routes. Current product rules still supersede obsolete five-tab navigation, mandatory Bean/equipment, fabricated measurements, AR/camera, Collection-first behavior, and unimplemented AI/chat actions. Implemented screens retain the references' warm editorial canvas, restrained rules/radius, serif content hierarchy, sans operational data, dominant bottom CTA, and spacious mobile rhythm. Fixture tooling uses a deliberately utilitarian layout and is not product UI.

The 390px responsive baseline uses `--bottom-nav-height` and `--sticky-bottom` for safe-area-aware CTA clearance. Four-column summaries become labeled mobile rows, stages become stacked label/value rows, Current/Suggested comparisons become vertical, form controls retain at least 16px text, and long user/domain text wraps naturally. Overflow is fixed at the responsible component; body-level hiding is not used as a substitute.

Migration Review uses the same restrained editorial rules: a four-item summary becomes a 2×2 grid at 390px, warnings use ruled text blocks rather than decorative cards, and consent/disabled continuation controls remain full-width above safe-area navigation. Status and errors use semantic roles and headings receive programmatic focus after loading or phase changes.

Journal Next Try cards use an inline source label, lifecycle text, one adjustment comparison, and a text action inside the single card link. Accepted/Overridden and execution status are communicated in words, not color alone. Repair feedback uses the existing notice/warning treatment and keeps the user on Plan Detail to review the refreshed state.

Handoff UI maps design/13 to Plan status and Current→Next Try, design/04 to low-interference Live Brew context/warnings, design/14 to compact Journal/Brew Hub markers, and design/15 to source/result detail sections. Warnings use text plus borders, remain below the primary stage hierarchy, and actions preserve bottom safe-area clearance at 390px.

Suggested Plan confirmation and detail follow the restrained editorial table language of `design/13-saved-plan-detail.png`: bordered sections, clear Current → Next Try comparison, one dominant CTA, limited radius, and sticky actions above bottom navigation/safe area. `design/12-recipe-detail-personal.png` is a personal Recipe reference rather than the Plan Detail screen, so it is not copied as a new Recipe editor. At 390px, comparison and detail rows collapse without horizontal overflow.

Mobile-first tokens live in `src/app/globals.css`: warm canvas/surface, dark high-contrast ink, restrained coffee accent, border and muted colors, spacing, and a 48px tap target. Display names/headings may use a serif; operational copy, data, buttons, and navigation use sans serif.

The current font stack uses safe system fallbacks (`Georgia` / `Noto Serif TC` and `Inter` / `Noto Sans TC`). Replace these with licensed brand font assets when the final identity package is available.

Live Brew must prioritize large type, high contrast, glanceability, and one-handed actions. Respect `env(safe-area-inset-bottom)`, prevent horizontal overflow, and support reduced motion. Avoid generic SaaS dashboards, default shadcn styling, and overly rounded, cute, or cartoon-like components.

Quick Prepare follows `design/03-quick-prepare.png`: centered serif title, bordered recipe summary, separated input rows, restrained override labels, optional editorial fields, and one dark CTA. Collection/Me navigation, required Bean, and interactive AI blocks from the older design are excluded by current product architecture.

The Live Brew foundation follows `design/04-live-brew.png`: compact metrics, generous focal space, large serif target weight, ordered stages, and weight summary. AR/camera, live weight, pause, finish, auto-next, and active timer controls remain omitted. At 390px, bounded grids and wrapping avoid fixed-width overflow.

The active Live Brew state keeps the same design/04 hierarchy while replacing fabricated weight with an em dash. A separate dark timer band displays total and stage elapsed time without an aria-live announcement each second. Stage rows include textual Completed, Current stage, or Not started labels plus a check mark for completed stages, so status never depends on color alone. The sticky primary CTA sits above the three-item safe-area navigation.

Brew Complete maps design/05's centered serif summary, identity card, ruled overview/stage tables, and bottom CTA to currently measurable data. Extraction/TDS and fabricated actual dose, water, or temperature are replaced by an explicit missing-measurements notice. Journal retains design/14's spacious recent-card language without filters, AI, plans, or Bean progress. Brew Detail uses design/08/15's editorial hierarchy without photos, editing, AI summary, Flavor Feedback, or secondary action clusters.

Flavor Feedback maps design/06's centered serif title, bordered Brew identity, divided sections, circular five-point rating controls, lightweight multi-select notes, and safe-area-aware bottom action. The obsolete five-item navigation, Collection, Me, Edit Brew, overflow action, and “Generate AI Analysis” CTA from the reference are intentionally omitted; current navigation remains Discover, Brew, and Journal. Controls remain textual and semantic, with no AI-generated interpretation.

Edit Brew Details combines design/09's divided editorial form and fixed primary action with design/16's direct text/number editing. The implementation keeps only the approved Bean, Equipment, Actual Data, and Notes groups; Recipe and stages stay read-only. Inputs use restrained corners, visible labels, optional markers, target references, and safe-area spacing. Library selectors and the references' obsolete five-item navigation are omitted.

Analysis follows design/07's centered serif heading, ruled source summary, editorial conclusion sections, and recommendation hierarchy. It replaces fabricated extraction/TDS claims with data-quality limits, confidence labels, evidence lists, a local-preview badge, privacy copy, and a disclaimer. Save as Recipe, Fork, Brew Again, Ask AI, and the obsolete five-item navigation are omitted.
