# REQ-39b — Auth nickname plan, not implemented

Split from REQ-39 by the user's review on 2026-10-26. Notion plan:
https://www.notion.so/405e841a44e381109fe9d20c08fcc05f

## Proposed flow for review

- New signup collects a validated nickname (existing 2–40 character contract)
  within Auth. Preserve email confirmation, resend, change-email, cancel and
  local-mode behavior. No authenticated session means no direct profiles write.
- Existing account login reads its own profile first. Keep confirmed names.
  Missing/blank/invalid names prompt in the same Auth flow; cancellation can
  return to the origin page and never blocks local brewing.
- Email-like names cannot reliably distinguish an old bootstrap default from
  an intentional nickname. Propose an explicit confirmation marker in existing
  preferences JSON, with a one-time keep/edit choice for unconfirmed old names.
  Do not infer consent, clear names or overwrite a local/cloud profile silently.
- A session with incomplete profile remains signed in; Me offers fill/retry.
  ProfileBootstrapService returns needs-name instead of inventing an email
  prefix, and only writes a user-confirmed or explicitly retained valid name.
- UI uses services/repositories. Signup metadata may carry display data to the
  first authenticated bootstrap, never authorization claims. No password/session
  storage is added. Owner scope, revision protection, unrelated preferences,
  createdAt, experience and needs must be preserved.
- Duplicate auth events, Strict Mode, reload and confirmation callbacks must be
  idempotent. Bind pending names and request generations to user IDs so account
  switching cannot write a stale name into a different account. Failed profile
  writes preserve the session/input, expose retry and do not claim cloud sync.

## Boundaries and verification

No implementation is authorized by this plan. REQ-39 does not edit AuthForm,
AuthProvider, ProfileBootstrapService, auth persistence, SQL or cloud data.
Before REQ-39b implementation inspect existing owner policies/contracts; any
required schema change needs a separate plan. Journeys 14/15 and REQ-37b still
own account migration/sync. Guest DiscoveryPreferences do not fabricate a full
UserProfile or an experience choice.

Test new confirmation flows, valid/missing/email-derived old names, explicit
keep/edit, local prefill without overwrite, authenticated-but-incomplete profile,
cancel, failed write/retry, duplicate callbacks, account switch, stale responses,
reload and safe next route. Add a regression proving no email-prefix fallback.
Run lint/typecheck/tests/build and hand off under collaboration.md after approval;
do not commit/push automatically. The detailed Chinese plan is saved in Notion.
