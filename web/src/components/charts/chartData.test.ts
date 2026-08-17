import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBucketData, buildPriorityData, buildWorkloadData } from './chartData.ts';

test('builds charts directly from tasks including unassigned tasks', () => {
  const tasks = [
    { id: 'a', bucketId: 'todo', priority: 'urgent' },
    { id: 'b', bucketId: 'todo', priority: 'low' },
    { id: 'c', priority: 'urgent' },
  ];

  assert.deepEqual(buildBucketData(tasks, [{ id: 'todo', name: 'Offen' }]), [
    { name: 'Offen', value: 2 },
    { name: 'Nicht zugewiesen', value: 1 },
  ]);
  assert.deepEqual(buildPriorityData(tasks, ['urgent', 'low']), [
    { name: 'Urgent', value: 2 },
    { name: 'Low', value: 1 },
  ]);
});

test('understands the analytics API workload field names', () => {
  assert.deepEqual(buildWorkloadData([
    { userId: '7', username: 'Noah', totalTasks: 4, completedTasks: 2 },
  ]), [{ name: 'Noah', tasks: 4, completed: 2 }]);
});
