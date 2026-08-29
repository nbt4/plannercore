import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { Gauge, Kanban, Menu, Sun } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { PlanProvider, usePlanContext } from './contexts/PlanContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { TasksProvider } from './contexts/TasksContext'
import Sidebar from './components/layout/Sidebar'
import PlanHeader from './components/layout/PlanHeader'
import BoardView from './components/board/BoardView'
import GridView from './components/grid/GridView'
import ScheduleView from './components/schedule/ScheduleView'
import ChartsView from './components/charts/ChartsView'
import TimelineView from './components/timeline/TimelineView'
import PeopleView from './components/people/PeopleView'
import GoalsView from './components/goals/GoalsView'
import MyTasksPage from './pages/MyTasksPage'
import MyDayPage from './pages/MyDayPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'

function PlanLayout() {
  return (
    <PlannerShell locked>
      <PlanHeader />
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="board" element={<BoardView />} />
          <Route path="grid" element={<GridView />} />
          <Route path="schedule" element={<ScheduleView />} />
          <Route path="charts" element={<ChartsView />} />
          <Route path="timeline" element={<TimelineView />} />
          <Route path="people" element={<PeopleView />} />
          <Route path="goals" element={<GoalsView />} />
        </Routes>
      </div>
    </PlannerShell>
  )
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlannerShell>
      <div className="planner-page-scroll flex-1 flex flex-col min-w-0 overflow-auto">
        {children}
      </div>
    </PlannerShell>
  )
}

function PlannerShell({ children, locked = false }: { children: React.ReactNode; locked?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('planner-sidebar-collapsed') === 'true')
  const { activePlanId } = usePlanContext()
  const activePlanPath = activePlanId ? `/plan/${activePlanId}/board` : '/plan/new'

  useEffect(() => {
    document.body.classList.toggle('planner-drawer-open', mobileOpen)
    return () => document.body.classList.remove('planner-drawer-open')
  }, [mobileOpen])

  useEffect(() => {
    window.localStorage.setItem('planner-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  return (
    <div className={`planner-shell ${locked ? 'is-locked' : ''}`}>
      {mobileOpen && <button type="button" className="planner-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Navigation schließen" />}
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(value => !value)}
      />

      <div className="planner-mobile-header">
        <button type="button" className="planner-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Navigation öffnen" aria-expanded={mobileOpen}>
          <Menu size={22} />
        </button>
      </div>

      <main className="planner-main">
        {children}
      </main>

      <nav className="planner-mobile-tabs" aria-label="Schnellnavigation">
        <NavLink to="/" end className={({ isActive }) => `planner-mobile-tab ${isActive ? 'is-active' : ''}`}>
          <Gauge size={21} />
          <span>Start</span>
        </NavLink>
        <NavLink to="/my/day" className={({ isActive }) => `planner-mobile-tab ${isActive ? 'is-active' : ''}`}>
          <Sun size={21} />
          <span>Mein Tag</span>
        </NavLink>
        <NavLink to={activePlanPath} className={({ isActive }) => `planner-mobile-tab ${isActive ? 'is-active' : ''}`}>
          <Kanban size={21} />
          <span>Board</span>
        </NavLink>
        <button type="button" className={`planner-mobile-tab ${mobileOpen ? 'is-active' : ''}`} onClick={() => setMobileOpen(true)}>
          <Menu size={21} />
          <span>Pläne</span>
        </button>
      </nav>
    </div>
  )
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="planner-auth-screen flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-surface)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Laden...</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" />
  return <>{children}</>
}

export default function App() {
  // PlannerCore is available both on its own domain at `/` and through the
  // dashboard proxy at `/planner`. Only apply the proxy basename when the
  // current URL actually uses it; otherwise React Router renders a blank app.
  const basename = window.location.pathname === '/planner' || window.location.pathname.startsWith('/planner/')
    ? '/planner'
    : undefined
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <PlanProvider>
          <WebSocketProvider>
            <TasksProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<AuthGate><AppLayout><DashboardPage /></AppLayout></AuthGate>} />
                <Route path="/dashboard" element={<AuthGate><AppLayout><DashboardPage /></AppLayout></AuthGate>} />
                <Route path="/plan/:planId/*" element={<AuthGate><PlanLayout /></AuthGate>} />
                <Route path="/my/tasks" element={<AuthGate><AppLayout><MyTasksPage /></AppLayout></AuthGate>} />
                <Route path="/my/day" element={<AuthGate><AppLayout><MyDayPage /></AppLayout></AuthGate>} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </TasksProvider>
          </WebSocketProvider>
        </PlanProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
