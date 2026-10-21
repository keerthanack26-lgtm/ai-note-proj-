import { Link } from 'react-router-dom'
import { formatDate } from '../utils/format'
import StatusBadge from './StatusBadge'

export default function NoteCard({ note, onExport, onDelete }) {
  return (
    <article className="card note-card">
      <div className="meta">
        <StatusBadge value={note.processing_status} />
        <span>{note.category}</span>
        <span>{formatDate(note.created_at)}</span>
      </div>
      <h2>{note.title || 'Untitled note'}</h2>
      <p className="hint">{note.short_summary || 'No summary yet.'}</p>
      <div className="card-actions">
        <Link className="btn btn-primary btn-small" to={`/notes/${note.id}`}>
          Open
        </Link>
        <Link className="btn btn-ghost btn-small" to={`/notes/${note.id}/edit`}>
          Edit
        </Link>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => onExport(note, 'txt')}>
          TXT
        </button>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => onExport(note, 'pdf')}>
          PDF
        </button>
        <button className="btn btn-danger btn-small" type="button" onClick={() => onDelete(note)}>
          Delete
        </button>
      </div>
    </article>
  )
}
