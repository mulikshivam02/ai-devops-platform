interface StatusBadgeProps {
  label: string;
  tone: 'healthy' | 'pending' | 'unavailable';
}

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{label}</span>;
}
