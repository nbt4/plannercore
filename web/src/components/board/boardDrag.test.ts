import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupTasksForDrag, moveTaskInGroups, reorderPayload } from './boardDrag.ts';

test('always places completed tasks after open tasks in each bucket', () => {
  const groups = groupTasksForDrag([
    { id: 'done-first', title: 'Done', bucketId: 'todo', position: 0, status: 'completed' },
    { id: 'open-second', title: 'Open', bucketId: 'todo', position: 1000, status: 'not-started' },
    { id: 'done-last', title: 'Done too', bucketId: 'todo', position: 2000, status: 'completed' },
  ], ['todo']);

  assert.deepEqual(groups.todo.map((task) => task.id), [
    'open-second',
    'done-first',
    'done-last',
  ]);
});

test('moves a task within a bucket using the visible target order', () => {
  const groups = groupTasksForDrag([
    { id: 'a', title: 'A', bucketId: 'todo', position: 0 },
    { id: 'b', title: 'B', bucketId: 'todo', position: 1 },
    { id: 'c', title: 'C', bucketId: 'todo', position: 2 },
  ], ['todo']);

  const moved = moveTaskInGroups(groups, 'a', 'c');
  assert.deepEqual(moved.todo.map((task) => task.id), ['b', 'c', 'a']);
});

test('moves a task between buckets and persists every resulting position', () => {
  const groups = groupTasksForDrag([
    { id: 'a', title: 'A', bucketId: 'todo', position: 0 },
    { id: 'b', title: 'B', bucketId: 'doing', position: 0 },
  ], ['todo', 'doing']);

  const moved = moveTaskInGroups(groups, 'a', 'b');
  assert.deepEqual(moved.todo, []);
  assert.deepEqual(moved.doing.map((task) => task.id), ['a', 'b']);
  assert.deepEqual(reorderPayload(moved, ['todo', 'doing']), [
    { id: 'a', bucketId: 'doing', position: 0 },
    { id: 'b', bucketId: 'doing', position: 1000 },
  ]);
});

test('keeps completed tasks at the bottom while dragging', () => {
  const groups = groupTasksForDrag([
    { id: 'open', title: 'Open', bucketId: 'todo', position: 0, status: 'not-started' },
    { id: 'done', title: 'Done', bucketId: 'todo', position: 1000, status: 'completed' },
  ], ['todo']);

  const moved = moveTaskInGroups(groups, 'done', 'open');
  assert.deepEqual(moved.todo.map((task) => task.id), ['open', 'done']);
});
