# Assignee-Anzeigename-Fix (Outlook-Style Picker)

## Problem

`TaskAssignee` in the backend stores only `TaskID` and `UserID` — no username, email,
or avatar. `AddAssignee` (`internal/tasks/handler.go:380-397`) persists just that. So
any assignee data coming back from a normal task load (`GetTask`, `ListTasks`, page
refresh, another tab) has no display name — only the optimistic in-memory merge done
right after adding an assignee (`TasksContext.tsx:130-138`) happens to have it, and that
is lost on the next fetch.

This compounds in the UI:
- `board/TaskCard.tsx:128` hardcodes `<Avatar username={a.userId} ... />` — always
  renders initials computed from the raw numeric user ID, never the real name.
- `TaskDetailPanel.tsx:679-681` and `GridView.tsx:107` degrade to `a.username || a.userId`,
  showing the raw ID once `username` is undefined post-refresh.

Separately, the existing assignee picker (`TaskDetailPanel.tsx:34-65, 723-760`) already
has debounced search-as-you-type against `/api/v1/planner/users`, rendering a dropdown
of `Avatar` + username. It is functional but not fully "Outlook-style": Enter always
picks the first suggestion regardless of what's highlighted, there's no keyboard up/down
navigation, and no email is shown to disambiguate similar names.

## Scope

**In scope:**
1. Backend: live-join assignee/user data so username, email, and avatar URL are always
   present and fresh, wherever assignees are returned.
2. Frontend: pass the now-reliable `avatarUrl` through to the already image-capable
   `Avatar` component at all existing call sites; fix `TaskCard.tsx`'s hardcoded
   `userId` bug.
3. Frontend: picker polish — arrow-key navigation, Escape to close, email line in the
   suggestion dropdown.

**Out of scope (explicitly deferred to a separate, later project):**
- Any Microsoft 365 / Azure AD integration (login, Graph API sync of display name,
  avatar, or other user properties). This is tracked separately as "MS-Tenant-Sync
  (Azure AD)" and will define its own spec when picked up. This fix only reads/displays
  whatever is already in the shared `users` / `user_profiles` tables — it does not add
  any new way to populate `avatar_url` (no upload UI, no M365 sync). If `avatar_url` is
  unset, the UI falls back to computed initials, which already works today.
- Hiding already-assigned users from the suggestion dropdown (considered, not requested).
- Denormalizing username/avatar onto `TaskAssignee` (rejected — see Backend Design).

## Backend Design

`TaskAssignee` schema is unchanged (`TaskID`, `UserID` only). Instead of denormalizing,
every place that serializes a task's assignees joins live against `users` (for
`username`, `email`) and `user_profiles` (`LEFT JOIN`, since a profile row is optional)
for `avatar_url`:

- `internal/tasks/handler.go`: `GetTask`, `ListTasks`, and `publishTaskUpdated` (added in
  the WebSocket live-sync work, commit `d8ceefc`) all build their assignee list through
  this joined query instead of a bare `TaskAssignee` scan.
- Response shape per assignee becomes `{userId, username, email, avatarUrl}` (`avatarUrl`
  may be null/empty when no `user_profiles` row exists).
- `GET /api/v1/planner/users` (search endpoint, `cmd/server/main.go:167-184`) gains
  `avatarUrl` in its response alongside the existing `userId`/`username`/`email`.

**Why live-join over denormalization:** usernames and avatar URLs can change after an
assignment is made (e.g. edited in WarehouseCore's profile page, which already writes
`user_profiles.avatar_url`). Denormalizing would go stale silently — exactly the failure
mode the final WebSocket-live-sync review flagged in the assignee optimistic `username`
field (dead, drifting data). A live join keeps a single source of truth and costs one
cheap join per task-load, which is the right tradeoff at this data scale (a handful of
assignees per task).

## Frontend Design: Display

`web/src/components/shared/Avatar.tsx` already accepts an `avatarUrl` prop and renders
`<img>` when present, falling back to computed initials otherwise — no change needed
there. The fix is wiring real data through to it:

- `board/TaskCard.tsx:128` — replace `username={a.userId}` with `username={a.username}`
  (now reliably populated) and add `avatarUrl={a.avatarUrl}`.
- `TaskDetailPanel.tsx:679,757`, `GridView.tsx:271`, `CommentsSection.tsx:121`,
  `PeopleView.tsx:116` — same pattern: pass `avatarUrl` from the assignee object
  alongside the existing `username`.
- `TasksContext.tsx`'s `addAssignee` optimistic merge (`:130-138`) uses the full
  `{userId, username, email, avatarUrl}` object already returned by the picker's search
  results — no extra round-trip needed, since the search endpoint now returns everything
  the UI needs.

## Frontend Design: Picker Polish

In `TaskDetailPanel.tsx` (search/suggestions block, ~lines 34-65, 652-760):

- New `highlightedIndex` state, initialized to `0` whenever `assigneeSuggestions`
  changes.
- **ArrowDown/ArrowUp**: move `highlightedIndex` within `assigneeSuggestions`, wrapping
  around at both ends (matches Outlook/Teams people-picker behavior).
- **Enter**: selects `assigneeSuggestions[highlightedIndex]` (previously always index 0).
- **Escape**: closes the suggestion dropdown (new — didn't exist before).
- Each suggestion row shows a second, smaller line with the user's email beneath the
  username, using existing CSS variables (no new color/spacing tokens).
- The highlighted row gets a visual active/hover state via existing CSS variables.

## Testing

- Backend: extend or add handler-level tests (or, if none exist yet for this handler,
  follow the existing project convention of no dedicated backend tests here — verify
  manually per the `verify` skill instead, consistent with how the WebSocket live-sync
  work was verified) confirming `GetTask`/`ListTasks` responses include populated
  `username`/`email`/`avatarUrl` for a task with an assignee that has a `user_profiles`
  row, and still populate `username`/`email` with `avatarUrl: null` when no profile row
  exists.
- Frontend: manual verification (per the `verify` skill) that:
  - A task card shows the assignee's real name/avatar after a full page reload (not the
    raw user ID) — this is the core regression test for the bug.
  - Arrow keys move the highlight through multiple suggestions; Enter picks the
    highlighted one, not always the first.
  - Escape closes the dropdown.
  - Email appears under each suggestion's username.
  - When a user has no `user_profiles.avatar_url`, the initials fallback still renders
    correctly (no broken image icon, no blank avatar).
