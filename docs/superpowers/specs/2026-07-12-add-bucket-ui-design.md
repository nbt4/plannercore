# Add Bucket (Spalte) UI — Design

## Problem

`BoardView.tsx` renders existing buckets via `BucketColumn`, and the backend
(`POST /api/v1/planner/:planId/buckets`, `api.buckets.create` in
`plannerApi.ts`) already supports creating a bucket — but no UI ever calls
`api.buckets.create`. There is no way to create a bucket from the app. When a
plan has zero buckets, `BoardView` shows an `EmptyState` telling the user to
"add columns," with no control to do so.

## Design

Add an `AddBucketInline` component, mirroring the existing `AddTaskInline`
interaction pattern used inside `BucketColumn`:

- Renders as a ghost column at the end of the row in `BoardView.tsx`, same
  `minWidth`/`maxWidth` as `BucketColumn`.
- Default state: a "+ Spalte hinzufügen" button.
- Click switches it to a text input with confirm/cancel, matching
  `AddTaskInline`'s existing inline-edit pattern.
- Enter/confirm calls `api.buckets.create(planId, name)`; on success the
  returned bucket is appended to `BoardView`'s `buckets` state (optimistic,
  no full refetch needed).
- Escape or blur-with-empty-input reverts to the button state, no request
  sent.
- On request failure, show an inline error under the input and keep it open
  so the user can retry — no silent failure.

### BoardView change

`BoardView.tsx` currently returns early with an `EmptyState` when
`columns.length === 0`, before reaching the row that renders `BucketColumn`s.
`AddBucketInline` must render in that case too, otherwise the empty state
stays a dead end. The empty-columns early return is removed in favor of
always rendering the row (existing columns, if any, followed by
`AddBucketInline`); the `EmptyState` copy can move to sit alongside/above the
ghost column instead of replacing the whole view.

## Out of scope

- Rename/delete/reorder buckets (the existing `MoreHorizontal` "…" menu on
  `BucketColumn` stays unwired; not part of this change).
- Modal-based creation flow (rejected in favor of matching the existing
  inline pattern).
