import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, FolderKanban, RefreshCw, Sun } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePlans } from '../hooks/usePlans'
import { suiteDateLabel, suiteGreeting } from '../lib/cores-design'
import { isTaskCompleted } from '../lib/taskCompletion'
import { api } from '../services/plannerApi'

interface DashboardTask {
  id: string
  title: string
  planId?: string
  planName?: string
  dueDate?: string
  priority?: string
  status?: string
  completedAt?: string | null
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { plans } = usePlans()
  const [tasks, setTasks] = useState<DashboardTask[]>([])
  const [dayTasks, setDayTasks] = useState<DashboardTask[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [all, day] = await Promise.all([api.my.tasks(true), api.my.day()])
      setTasks(all || [])
      setDayTasks(day || [])
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const overview = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const tomorrow = today + 86_400_000
    const open = tasks.filter((task) => !isTaskCompleted(task))
    const overdue = open.filter((task) => task.dueDate && new Date(task.dueDate).getTime() < today)
    const dueToday = open.filter((task) => {
      if (!task.dueDate) return false
      const due = new Date(task.dueDate).getTime()
      return due >= today && due < tomorrow
    })
    const priorities = [...open]
      .sort((a, b) => {
        const aLate = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        const bLate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        return aLate - bLate
      })
      .slice(0, 6)
    return { open, overdue, dueToday, priorities }
  }, [tasks])

  const metrics = [
    { label: 'Offene Aufgaben', value: overview.open.length, detail: `${tasks.length - overview.open.length} abgeschlossen`, icon: ClipboardList },
    { label: 'Mein Tag', value: dayTasks.filter((task) => !isTaskCompleted(task)).length, detail: 'Heute eingeplant', icon: Sun },
    { label: 'Heute fällig', value: overview.dueToday.length, detail: 'Mit heutigem Fälligkeitsdatum', icon: CalendarDays },
    { label: 'Aktive Pläne', value: plans.length, detail: 'Für dich sichtbar', icon: FolderKanban },
  ]

  return (
    <div className="suite-dashboard planner-dashboard">
      <header className="suite-dashboard-header">
        <div className="suite-dashboard-heading">
          <p className="suite-dashboard-eyebrow"><span className="suite-dashboard-eyebrow-dot" />{suiteDateLabel()}</p>
          <h1 className="suite-dashboard-title">{suiteGreeting(user)}</h1>
          <p className="suite-dashboard-subtitle">Deine Aufgaben, Termine und Pläne auf einen Blick.</p>
        </div>
        <div className="suite-dashboard-actions">
          {lastUpdated && <span className="suite-dashboard-timestamp">Aktualisiert {lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button type="button" className="suite-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'planner-spin' : ''} />Aktualisieren</button>
        </div>
      </header>

      <section className="suite-kpi-grid" aria-label="Planungskennzahlen">
        {metrics.map(({ label, value, detail, icon: Icon }) => <article className="suite-kpi-card" key={label}><div className="suite-kpi-label"><Icon size={16} />{label}</div><div className="suite-kpi-value">{value}</div><div className="suite-kpi-detail">{detail}</div></article>)}
      </section>

      <section className="planner-dashboard-grid">
        <div className="suite-card planner-dashboard-card">
          <header><div><h2>Jetzt bearbeiten</h2><p>Nach Fälligkeit priorisiert</p></div><AlertTriangle size={20} style={{ color: overview.overdue.length ? 'var(--color-warning)' : 'var(--color-success)' }} /></header>
          {overview.priorities.length === 0
            ? <div className="planner-dashboard-empty"><CheckCircle2 size={34} /><strong>Keine offenen Aufgaben</strong><span>Deine persönliche Liste ist erledigt.</span></div>
            : <div>{overview.priorities.map((task) => <Link className="planner-dashboard-task" key={task.id} to={task.planId ? `/plan/${task.planId}/board` : '/my/tasks'}><span><strong>{task.title}</strong><small>{task.planName || 'Ohne Plan'}{task.dueDate ? ` · ${new Date(task.dueDate).toLocaleDateString('de-DE')}` : ''}</small></span><b>{task.priority === 'urgent' ? 'Dringend' : task.dueDate && new Date(task.dueDate).getTime() < Date.now() ? 'Überfällig' : 'Offen'}</b></Link>)}</div>}
        </div>

        <div className="suite-card planner-dashboard-card">
          <header><div><h2>Schnellstart</h2><p>Häufige Planungsbereiche</p></div></header>
          <div className="planner-dashboard-quick">
            <Link className="suite-button suite-button--primary" to="/my/tasks">Meine Aufgaben</Link>
            <Link className="suite-button" to="/my/day">Mein Tag</Link>
            {plans.slice(0, 2).map((plan) => <Link className="suite-button" key={plan.id} to={`/plan/${plan.id}/board`}>{plan.name}</Link>)}
          </div>
        </div>
      </section>
    </div>
  )
}
