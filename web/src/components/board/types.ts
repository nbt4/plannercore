export interface TaskCardData {
  id: string;
  title: string;
  priority?: string;
  progress?: number;
  status?: string;
  isLate?: boolean;
  dueDate?: string;
  bucketId?: string;
  position?: number;
  labels?: { id: string; name: string; color: string }[];
  assignees?: { userId: string; displayName?: string; username?: string; avatarUrl?: string }[];
  checklistCompletedCount?: number;
  checklistTotalCount?: number;
}
