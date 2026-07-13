import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { PlanProvider } from './contexts/PlanContext'
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

function PlanLayout() {
  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--color-surface)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
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
      </div>
    </div>
  )
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--color-surface)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {children}
      </div>
    </div>
  )
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-surface)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Laden...</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" />
  return <>{children}</>
}

export default function App() {
  const basename = import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL : undefined;
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <PlanProvider>
          <WebSocketProvider>
            <TasksProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/plan/:planId/*" element={<AuthGate><PlanLayout /></AuthGate>} />
                <Route path="/my/tasks" element={<AuthGate><AppLayout><MyTasksPage /></AppLayout></AuthGate>} />
                <Route path="/my/day" element={<AuthGate><AppLayout><MyDayPage /></AppLayout></AuthGate>} />
                <Route path="*" element={<Navigate to="/plan/new" />} />
              </Routes>
            </TasksProvider>
          </WebSocketProvider>
        </PlanProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
