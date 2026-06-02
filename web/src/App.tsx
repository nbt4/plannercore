import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { PlanProvider } from './contexts/PlanContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import Sidebar from './components/layout/Sidebar'
import PlanHeader from './components/layout/PlanHeader'
import BoardView from './components/board/BoardView'
import GridView from './components/grid/GridView'
import ScheduleView from './components/schedule/ScheduleView'
import ChartsView from './components/charts/ChartsView'
import TimelineView from './components/timeline/TimelineView'
import PeopleView from './components/people/PeopleView'
import GoalsView from './components/goals/GoalsView'

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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlanProvider>
          <WebSocketProvider>
            <Routes>
              <Route path="/plan/:planId/*" element={<PlanLayout />} />
              <Route path="/my/tasks" element={<div>My Tasks</div>} />
              <Route path="/my/day" element={<div>My Day</div>} />
              <Route path="*" element={<Navigate to="/plan/new" />} />
            </Routes>
          </WebSocketProvider>
        </PlanProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
