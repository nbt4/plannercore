import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedTaskCount, isTaskCompleted, tasksByCompletion } from './taskCompletion.ts';

test('recognizes completed tasks from every supported API shape', () => {
  assert.equal(isTaskCompleted({ status: 'completed' }), true);
  assert.equal(isTaskCompleted({ completedAt: '2026-08-23T12:00:00Z' }), true);
  assert.equal(isTaskCompleted({ completed: true }), true);
  assert.equal(isTaskCompleted({ status: 'in-progress', completedAt: null }), false);
});

test('hides completed tasks unless explicitly requested', () => {
  const tasks = [
    { id: 'open', status: 'not-started' },
    { id: 'done', status: 'completed' },
  ];

  assert.deepEqual(tasksByCompletion(tasks, false).map((task) => task.id), ['open']);
  assert.deepEqual(tasksByCompletion(tasks, true).map((task) => task.id), ['open', 'done']);
  assert.equal(completedTaskCount(tasks), 1);
});
