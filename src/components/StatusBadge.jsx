const TONES = {
  completed: 'badge-success',
  active: 'badge-success',
  resolved: 'badge-success',
  in_progress: 'badge-info',
  reviewing: 'badge-info',
  processing: 'badge-info',
  queued: 'badge-warning',
  preparing: 'badge-warning',
  pending: 'badge-warning',
  open: 'badge-warning',
  failed: 'badge-danger',
  deactivated: 'badge-danger',
  dismissed: 'badge-neutral',
  closed: 'badge-neutral',
  success: 'badge-success',
  draft: 'badge-neutral',
  high: 'badge-danger',
  medium: 'badge-warning',
  low: 'badge-neutral',
}

export default function StatusBadge({ value }) {
  const label = String(value || 'unknown').replaceAll('_', ' ')
  return <span className={`badge ${TONES[value] || 'badge-neutral'}`}>{label}</span>
}
