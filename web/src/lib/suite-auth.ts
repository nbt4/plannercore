import { appBasePath } from './app-paths';

export { appAssetPath, appBasePath, appPath } from './app-paths';

export function coresDashboardURL(): string {
  if (appBasePath === '/plannercore') return `${window.location.origin}/`;
  return (window as Window & { __DASHBOARD_URL__?: string }).__DASHBOARD_URL__ || '/';
}

export function centralLoginURL(): string {
  const dashboard = new URL(coresDashboardURL(), window.location.origin);
  const login = new URL('/login', dashboard);
  const localLoginPath = `${appBasePath}/login`;
  const current = window.location.pathname === localLoginPath
    ? `${appBasePath || ''}/`
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  login.searchParams.set('redirect', dashboard.origin === window.location.origin ? current : new URL(current, window.location.origin).toString());
  return login.toString();
}
