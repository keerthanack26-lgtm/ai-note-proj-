import { invokeFunction } from './api'

export function adminAction(action, body = {}) {
  return invokeFunction('admin-operations', { action, ...body })
}

export const ISSUE_STATUS_LABELS = {
  open: 'Open',
  reviewing: 'In Progress',
  resolved: 'Resolved',
  dismissed: 'Closed',
}

export function issueStatusLabel(value) {
  return ISSUE_STATUS_LABELS[value] || String(value || 'unknown').replaceAll('_', ' ')
}
