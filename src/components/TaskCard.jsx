import { Link } from 'react-router-dom'
import { formatDate, todayIso } from '../utils/format'
import StatusBadge from './StatusBadge'

export default function TaskCard({ task, onEdit, onStatus, onDelete }) {
  const overdue = task.due_date && task.status !== 'completed' && task.due_date < todayIso()
  return (
    <article className="card task-card">
      <div className="meta">
        <StatusBadge value={task.status} />
        <StatusBadge value={task.priority} />
        {overdue ? <span className="badge badge-danger">Overdue</span> : null}
      </div>
      <h2>{task.title}</h2>
      <p>{task.description || 'No description.'}</p>
      <p className="hint">Due {formatDate(task.due_date)}</p>
      {task.notes?.id ? <Link to={`/notes/${task.notes.id}`}>Related note: {task.notes.title}</Link> : <span className="hint">No related note</span>}
      {task.confidence === 'low' ? <p className="callout callout-warning">This task came from a low-confidence extraction. Confirm the details.</p> : null}
      <div className="card-actions">
        {task.status !== 'completed' ? (
          <button className="btn btn-primary btn-small" type="button" onClick={() => onStatus(task, 'completed')}>
            Complete
          </button>
        ) : (
          <button className="btn btn-ghost btn-small" type="button" onClick={() => onStatus(task, 'pending')}>
            Reopen
          </button>
        )}
        {task.status === 'pending' ? (
          <button className="btn btn-ghost btn-small" type="button" onClick={() => onStatus(task, 'in_progress')}>
            Start
          </button>
        ) : null}
        <button className="btn btn-ghost btn-small" type="button" onClick={() => onEdit(task)}>
          Edit
        </button>
        <button className="btn btn-danger btn-small" type="button" onClick={() => onDelete(task)}>
          Delete
        </button>
      </div>
    </article>
  )
}
