interface AvatarProps {
  username: string;
  size?: 'sm' | 'lg';
  avatarUrl?: string;
}

export default function Avatar({ username, size = 'sm', avatarUrl }: AvatarProps) {
  const dimension = size === 'lg' ? 40 : 28;
  const fontSize = size === 'lg' ? 'var(--text-sm)' : 'var(--text-xs)';
  const initials = username
    .split(/[\s._-]+/)
    .map((s) => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        style={{
          width: dimension,
          height: dimension,
          borderRadius: 'var(--radius-full)',
          objectFit: 'cover',
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: dimension,
        height: dimension,
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--surface-4)',
        color: 'var(--text-secondary)',
        fontSize,
        fontWeight: 'var(--weight-semibold)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials || '?'}
    </div>
  );
}
