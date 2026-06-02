interface ProgressBarProps {
  progress: number;
}

export default function ProgressBar({ progress }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));

  // Color transition: primary (info) -> warning -> success
  const hue =
    clamped < 50
      ? 210 // blue-ish
      : clamped < 80
        ? 40 // yellow-ish
        : 142; // green-ish

  return (
    <div
      style={{
        width: '100%',
        height: '6px',
        backgroundColor: 'var(--surface-4)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          borderRadius: 'var(--radius-full)',
          backgroundColor: `hsl(${hue}, 60%, 50%)`,
          transition: 'width 0.3s ease, background-color 0.3s ease',
        }}
      />
    </div>
  );
}
