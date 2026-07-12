# Add Bucket UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create a new bucket (column) on a plan's board from the UI, using the already-working `api.buckets.create` client call and `POST /api/v1/planner/:planId/buckets` backend route.

**Architecture:** A new `AddBucketInline` component, mirroring the existing `AddTaskInline` inline-edit pattern, renders as a ghost column at the end of the row in `BoardView.tsx`. `BoardView`'s current early return for zero buckets is removed so the row (existing buckets + the ghost column) always renders.

**Tech Stack:** React + TypeScript, existing `api` client (`web/src/services/plannerApi.ts`), inline style objects using the project's CSS custom properties (no CSS modules, no hardcoded colors).

## Global Constraints

- Match `AddTaskInline`'s interaction pattern exactly: default button → click reveals text input → Enter/blur-with-text confirms, Escape/blur-with-empty-text cancels.
- No modal dialog.
- On request failure, show an inline error message and keep the input open for retry — no silent failure (unlike `AddTaskInline`, which silently swallows errors; this component must not repeat that).
- Colors/spacing/radii must use existing CSS custom properties only — no hardcoded hex/px values (project-wide rule). Reuse `--color-danger` for the error message.
- This project has no frontend test framework (no vitest/jest/RTL, verified: `web/package.json` has no test script or test dependency, and no `*.test.*`/`*.spec.*` files exist anywhere under `web/src`). Do not add one for this change. Verification gate is `npm run build` (runs `tsc -b && vite build`) plus manual browser verification — consistent with how every other fix in this codebase is verified.

---

### Task 1: Create the `AddBucketInline` component

**Files:**
- Create: `web/src/components/board/AddBucketInline.tsx`

**Interfaces:**
- Consumes: `api.buckets.create(planId: string, name: string) => Promise<any>` from `web/src/services/plannerApi.ts:41-46` (returns the created bucket object, shape `{ id: string, name: string, ... }`).
- Produces: default export `AddBucketInline(props: { planId: string; onBucketAdded?: (bucket: any) => void })` — a React component. `onBucketAdded` is called with the newly created bucket object on success. Task 2 relies on this exact prop name and signature.

- [ ] **Step 1: Write the component**

```tsx
import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../services/plannerApi';

interface AddBucketInlineProps {
  planId: string;
  onBucketAdded?: (bucket: any) => void;
}

export default function AddBucketInline({ planId, onBucketAdded }: AddBucketInlineProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const bucket = await api.buckets.create(planId, trimmed);
      setName('');
      setError(null);
      setExpanded(false);
      onBucketAdded?.(bucket);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Spalte konnte nicht erstellt werden');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setName('');
      setError(null);
      setExpanded(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          minWidth: 280,
          maxWidth: 340,
          flexShrink: 0,
          padding: 'var(--space-3)',
          backgroundColor: 'transparent',
          border: 'var(--border-default)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-2)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
        }}
      >
        <Plus size={16} />
        <span>Spalte hinzufügen</span>
      </button>
    );
  }

  return (
    <div
      style={{
        minWidth: 280,
        maxWidth: 340,
        flexShrink: 0,
        padding: 'var(--space-3)',
        backgroundColor: 'var(--surface-1)',
        borderRadius: 'var(--radius-md)',
        border: 'var(--border-default)',
      }}
    >
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!name.trim()) {
            setExpanded(false);
            setError(null);
          } else {
            handleAdd();
          }
        }}
        placeholder="Spaltenname..."
        style={{
          width: '100%',
          padding: 'var(--space-2) var(--space-3)',
          backgroundColor: 'var(--surface-0)',
          border: 'var(--border-input)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
          outline: 'none',
        }}
      />
      {error && (
        <div
          style={{
            marginTop: 'var(--space-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: `tsc -b && vite build` completes with `✓ built in <N>s` and no TypeScript errors mentioning `AddBucketInline.tsx`.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/board/AddBucketInline.tsx
git commit -m "feat: add AddBucketInline component for creating board columns"
```

---

### Task 2: Wire `AddBucketInline` into `BoardView`

**Files:**
- Modify: `web/src/components/board/BoardView.tsx:199-217` (remove the zero-buckets early return), `BoardView.tsx:236-243` (render `AddBucketInline` after the mapped columns), `BoardView.tsx:1-15` (add import)

**Interfaces:**
- Consumes: `AddBucketInline` from Task 1, exact props `{ planId: string; onBucketAdded?: (bucket: any) => void }`.
- Consumes: existing `buckets` state and `setBuckets` setter already defined in `BoardView.tsx:20` (`const [buckets, setBuckets] = useState<any[]>([]);`).

- [ ] **Step 1: Add the import**

In `web/src/components/board/BoardView.tsx`, after the existing `BucketColumn` import (line 13):

```tsx
import BucketColumn from './BucketColumn';
import AddBucketInline from './AddBucketInline';
```

- [ ] **Step 2: Remove the zero-buckets early return**

Delete this block (currently `BoardView.tsx:209-217`), keeping the `!planId || planId === 'new'` block above it untouched:

```tsx
  if (columns.length === 0) {
    return (
      <EmptyState
        icon={Kanban}
        title="Keine Spalten"
        description="Dieser Plan hat noch keine Spalten. Fügen Sie Spalten hinzu, um Aufgaben zu organisieren."
      />
    );
  }
```

- [ ] **Step 3: Render `AddBucketInline` after the mapped columns**

Change the final render block from:

```tsx
          {columns.map((col) => (
            <BucketColumn
              key={col.bucket.id}
              bucket={col.bucket}
              tasks={col.tasks}
              planId={planId}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
```

to:

```tsx
          {columns.map((col) => (
            <BucketColumn
              key={col.bucket.id}
              bucket={col.bucket}
              tasks={col.tasks}
              planId={planId}
            />
          ))}
          <AddBucketInline
            planId={planId}
            onBucketAdded={(bucket) => setBuckets((prev) => [...prev, bucket])}
          />
        </div>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd web && npm run build`
Expected: `✓ built in <N>s`, no TypeScript errors. `Kanban` import in `BoardView.tsx` stays used (still referenced by the `!planId` empty state above).

- [ ] **Step 5: Manual verification in the browser**

This codebase has no frontend test suite, so this step is the actual acceptance check:
1. Rebuild and redeploy plannercore (`docker build`, push, Komodo `DeployStack` for the `plannercore` service in the `cores` stack — same pipeline used for every prior fix this session).
2. Open a plan with zero buckets. Confirm the "+ Spalte hinzufügen" ghost column renders instead of the old dead-end empty state.
3. Click it, type a name, press Enter. Confirm a real `BucketColumn` appears with that name and the ghost column stays available at the end of the row.
4. Repeat for a plan that already has buckets — confirm the ghost column appears after the existing ones.
5. Temporarily go offline (DevTools → Network → Offline) and try creating a bucket. Confirm the inline error message appears under the input and the input stays open with the typed name intact.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/board/BoardView.tsx
git commit -m "feat: render AddBucketInline in BoardView, remove dead-end empty state"
```
