import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPlannerEvent } from './plannerEvents.ts';

test('task.created appends a new task', () => {
  const state = { tasks: [], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'task.created',
    planId: 'p1',
    payload: { id: 't1', title: 'New task', updatedAt: '2026-01-01T00:00:00Z' },
  });
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].id, 't1');
});

test('task.updated replaces an existing task by id', () => {
  const state = {
    tasks: [{ id: 't1', title: 'Old title', updatedAt: '2026-01-01T00:00:00Z' }],
    buckets: [],
  };
  const result = applyPlannerEvent(state, {
    type: 'task.updated',
    planId: 'p1',
    payload: { id: 't1', title: 'New title', updatedAt: '2026-01-01T00:01:00Z' },
  });
  assert.equal(result.tasks[0].title, 'New title');
});

test('task.updated ignores a stale/out-of-order event', () => {
  const state = {
    tasks: [{ id: 't1', title: 'Current title', updatedAt: '2026-01-01T00:05:00Z' }],
    buckets: [],
  };
  const result = applyPlannerEvent(state, {
    type: 'task.updated',
    planId: 'p1',
    payload: { id: 't1', title: 'Stale title', updatedAt: '2026-01-01T00:01:00Z' },
  });
  assert.equal(result.tasks[0].title, 'Current title');
});

test('task.updated inserts the task if not already present locally', () => {
  const state = { tasks: [], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'task.updated',
    planId: 'p1',
    payload: { id: 't1', title: 'From another client', updatedAt: '2026-01-01T00:00:00Z' },
  });
  assert.equal(result.tasks.length, 1);
});

test('task.deleted removes the task by id', () => {
  const state = { tasks: [{ id: 't1' }, { id: 't2' }], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'task.deleted',
    planId: 'p1',
    payload: { taskId: 't1' },
  });
  assert.deepEqual(result.tasks.map((t) => t.id), ['t2']);
});

test('bucket.updated patches only the known fields, leaving others untouched', () => {
  const state = { tasks: [], buckets: [{ id: 'b1', name: 'Todo', position: 0 }] };
  const result = applyPlannerEvent(state, {
    type: 'bucket.updated',
    planId: 'p1',
    payload: { id: 'b1', position: 1 },
  });
  assert.equal(result.buckets[0].position, 1);
  assert.equal(result.buckets[0].name, 'Todo');
});

test('bucket.updated with no payload requests a refetch instead of guessing', () => {
  const state = { tasks: [], buckets: [{ id: 'b1', name: 'Todo', position: 0 }] };
  const result = applyPlannerEvent(state, {
    type: 'bucket.updated',
    planId: 'p1',
    payload: null,
  });
  assert.equal(result.needsRefetch, true);
  assert.equal(result.buckets[0].position, 0); // unchanged
});

test('bucket.updated for an unknown bucket id requests a refetch', () => {
  const state = { tasks: [], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'bucket.updated',
    planId: 'p1',
    payload: { id: 'unknown-bucket', position: 1 },
  });
  assert.equal(result.needsRefetch, true);
});

test('bucket.deleted removes the bucket by id', () => {
  const state = { tasks: [], buckets: [{ id: 'b1' }, { id: 'b2' }] };
  const result = applyPlannerEvent(state, {
    type: 'bucket.deleted',
    planId: 'p1',
    payload: { id: 'b1' },
  });
  assert.deepEqual(result.buckets.map((b) => b.id), ['b2']);
});

test('unknown event types are a no-op', () => {
  const state = { tasks: [{ id: 't1' }], buckets: [] };
  const result = applyPlannerEvent(state, {
    type: 'comment.added',
    planId: 'p1',
    payload: { id: 'c1' },
  });
  assert.deepEqual(result, state);
});
