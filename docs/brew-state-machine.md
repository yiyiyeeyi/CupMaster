# Brew State Machine

Status is four orthogonal axes, never one overloaded field.

- Execution: `not_started → in_progress ↔ paused → completed | abandoned`.
- Record: `draft → saved → archived`; pausing may remain a draft.
- Feedback: `not_requested → awaiting_feedback → completed | skipped`.
- Analysis: `not_requested → ready → processing → completed | failed`; retry may return failed to ready.

Completing execution does not complete feedback. Saving does not request analysis. A completed Brew can be saved with awaiting feedback and analysis not requested. Journal supports returning to drafts and filling optional information later.
