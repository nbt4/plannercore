export interface TaskCardData {
  id: string;
  title: string;
  priority?: string;
  progress?: number;
  dueDate?: string;
  bucketId?: string;
  position?: number;
  labels?: { id: string; name: string; color: string }[];
  assignees?: { userId: string }[];
  checklistCompletedCount?: number;
  checklistTotalCount?: number;
}
