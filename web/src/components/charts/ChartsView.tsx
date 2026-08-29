import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { api } from '../../services/plannerApi';
import { usePlanTasks } from '../../contexts/TasksContext';
import EmptyState from '../shared/EmptyState';
import { buildBucketData, buildPriorityData, buildWorkloadData } from './chartData';

const STATUS_COLORS = [
  'var(--color-primary)',
  'var(--color-warning)',
  'var(--color-success)',
  'var(--color-danger)',
  'var(--color-info)',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
];

const PRIORITY_BAR_COLORS = {
  urgent: 'var(--color-danger)',
  important: 'var(--color-warning)',
  medium: 'var(--color-info)',
  low: 'var(--color-muted)',
};

const priorityOrder = ['urgent', 'important', 'medium', 'low'];

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-2) var(--space-3)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <p style={{ margin: 0, fontWeight: 'var(--weight-semibold)' }}>
          {label || payload[0]?.name}
        </p>
        {payload.map((entry: any, idx: number) => (
          <p key={idx} style={{ margin: '2px 0 0', color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function ChartsView() {
  const { planId } = useParams<{ planId: string }>();
  const { tasks, buckets, loading: tasksLoading } = usePlanTasks();
  const [workload, setWorkload] = useState<any[]>([]);
  const [workloadLoading, setWorkloadLoading] = useState(true);

  useEffect(() => {
    if (planId && planId !== 'new') {
      setWorkloadLoading(true);
      api.analytics.workload(planId)
        .then((work) => setWorkload(work || []))
        .catch(() => setWorkload([]))
        .finally(() => setWorkloadLoading(false));
    } else {
      setWorkloadLoading(false);
      setWorkload([]);
    }
  }, [planId]);

  const statusData = useMemo(() => buildBucketData(tasks, buckets), [buckets, tasks]);
  const priorityData = useMemo(
    () => buildPriorityData(tasks, priorityOrder).map((datum) => ({
      ...datum,
      fill: PRIORITY_BAR_COLORS[
        datum.name.toLowerCase() as keyof typeof PRIORITY_BAR_COLORS
      ],
    })),
    [tasks],
  );
  const workloadData = useMemo(() => buildWorkloadData(workload), [workload]);

  if (!planId || planId === 'new') {
    return (
      <EmptyState
        icon={BarChart3}
        title="Wählen Sie einen Plan"
        description="Erstellen oder wählen Sie einen Plan, um Diagramme anzuzeigen."
      />
    );
  }

  if (tasksLoading || workloadLoading) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      >
        Laden...
      </div>
    );
  }

  const hasData =
    statusData.length > 0 || priorityData.length > 0 || workloadData.length > 0;

  if (!hasData) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Keine Daten verfügbar"
        description="Fügen Sie Aufgaben mit Prioritäten und Bearbeitern hinzu, um Diagramme zu sehen."
      />
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 'var(--space-4)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {/* Tasks by Status - PieChart */}
        {statusData.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--surface-0)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-default)',
              padding: 'var(--space-4)',
            }}
          >
            <h3
              style={{
                margin: '0 0 var(--space-3)',
                fontSize: 'var(--text-base)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-primary)',
              }}
            >
              Aufgaben nach Spalte
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                  labelLine
                >
                  {statusData.map((_entry: any, idx: number) => (
                    <Cell
                      key={idx}
                      fill={STATUS_COLORS[idx % STATUS_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tasks by Priority - BarChart */}
        {priorityData.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--surface-0)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-default)',
              padding: 'var(--space-4)',
            }}
          >
            <h3
              style={{
                margin: '0 0 var(--space-3)',
                fontSize: 'var(--text-base)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-primary)',
              }}
            >
              Aufgaben nach Priorität
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={priorityData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Aufgaben" radius={[4, 4, 0, 0]}>
                  {priorityData.map((entry: any) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Workload - BarChart */}
        {workloadData.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--surface-0)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-default)',
              padding: 'var(--space-4)',
            }}
          >
            <h3
              style={{
                margin: '0 0 var(--space-3)',
                fontSize: 'var(--text-base)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-primary)',
              }}
            >
              Arbeitslast pro Bearbeiter
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={workloadData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{
                    color: 'var(--color-text-secondary)',
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="tasks"
                  name="Aufgaben"
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="completed"
                  name="Erledigt"
                  fill="var(--color-success)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
