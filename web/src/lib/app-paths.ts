const PLANNER_MOUNT_PATH = '/plannercore';

export const appBasePath = window.location.pathname === PLANNER_MOUNT_PATH
  || window.location.pathname.startsWith(`${PLANNER_MOUNT_PATH}/`)
  ? PLANNER_MOUNT_PATH
  : '';

export function appPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${appBasePath}${normalized}`;
}

export function appAssetPath(value: string): string {
  if (!appBasePath || !value || !value.startsWith('/') || value.startsWith(`${appBasePath}/`)) {
    return value;
  }
  return appPath(value);
}
