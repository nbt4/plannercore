import type { TaskCardData } from './types';

export const UNASSIGNED_BUCKET_ID = '__unassigned__';

export type TaskGroups = Record<string, TaskCardData[]>;

const taskBucketId = (task: TaskCardData) => task.bucketId || UNASSIGNED_BUCKET_ID;

export function groupTasksForDrag(tasks: TaskCardData[], bucketIds: string[]): TaskGroups {
  const groups: TaskGroups = {};
  [...bucketIds, UNASSIGNED_BUCKET_ID].forEach((id) => {
    groups[id] = [];
  });

  tasks.forEach((task) => {
    const bucketId = taskBucketId(task);
    if (!groups[bucketId]) groups[bucketId] = [];
    groups[bucketId].push(task);
  });

  Object.values(groups).forEach((items) => {
    items.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  });
  return groups;
}

function findTaskBucket(groups: TaskGroups, taskId: string): string | undefined {
  return Object.keys(groups).find((bucketId) => groups[bucketId].some((task) => task.id === taskId));
}

export function moveTaskInGroups(groups: TaskGroups, activeId: string, overId: string): TaskGroups {
  const sourceBucketId = findTaskBucket(groups, activeId);
  if (!sourceBucketId) return groups;

  const overTaskBucketId = findTaskBucket(groups, overId);
  const destinationBucketId = overTaskBucketId || (groups[overId] ? overId : undefined);
  if (!destinationBucketId) return groups;

  const sourceItems = [...groups[sourceBucketId]];
  const sourceIndex = sourceItems.findIndex((task) => task.id === activeId);
  if (sourceIndex < 0) return groups;

  if (sourceBucketId === destinationBucketId) {
    const destinationIndex = overTaskBucketId
      ? sourceItems.findIndex((task) => task.id === overId)
      : sourceItems.length - 1;
    if (destinationIndex < 0 || destinationIndex === sourceIndex) return groups;
    const [moved] = sourceItems.splice(sourceIndex, 1);
    sourceItems.splice(destinationIndex, 0, moved);
    return { ...groups, [sourceBucketId]: sourceItems };
  }

  const destinationItems = [...groups[destinationBucketId]];
  const [moved] = sourceItems.splice(sourceIndex, 1);
  const destinationIndex = overTaskBucketId
    ? destinationItems.findIndex((task) => task.id === overId)
    : destinationItems.length;
  destinationItems.splice(destinationIndex < 0 ? destinationItems.length : destinationIndex, 0, {
    ...moved,
    bucketId: destinationBucketId === UNASSIGNED_BUCKET_ID ? '' : destinationBucketId,
  });

  return {
    ...groups,
    [sourceBucketId]: sourceItems,
    [destinationBucketId]: destinationItems,
  };
}

export function reorderPayload(groups: TaskGroups, bucketIds: string[]) {
  const orderedBucketIds = [...bucketIds, UNASSIGNED_BUCKET_ID];
  return orderedBucketIds.flatMap((bucketId) =>
    (groups[bucketId] || []).map((task, index) => ({
      id: task.id,
      bucketId: bucketId === UNASSIGNED_BUCKET_ID ? '' : bucketId,
      position: index * 1000,
    })),
  );
}
