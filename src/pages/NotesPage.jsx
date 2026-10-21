import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ConfirmationModal from '../components/ConfirmationModal'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import FilterControls from '../components/FilterControls'
import LoadingSpinner from '../components/LoadingSpinner'
import NoteCard from '../components/NoteCard'
import Pagination from '../components/Pagination'
import SearchBar from '../components/SearchBar'
import { useToast } from '../context/ToastContext'
import { deleteNote, getNote, listNotes } from '../services/records'
import { CATEGORIES, PROCESSING_STATUSES } from '../utils/constants'
import { errorText } from '../utils/errors'
import { buildNoteText, downloadTextFile, exportNotePdf, noteExportFilename } from '../utils/exportNote'

export default function NotesPage() {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const [search, setSearch] = useState(params.get('q') || '')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  function load(nextPage = page) {
    setLoading(true)
    listNotes({ search, category, status, from, to, sort, page: nextPage })
      .then((data) => {
        setResult(data)
        setError('')
      })
      .catch((err) => setError(errorText(err, 'Notes could not be loaded.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1)
    setPage(1)
  }, [category, status, from, to, sort])

  useEffect(() => {
    const query = params.get('q') || ''
    if (query && query !== search) {
      setSearch(query)
      listNotes({ search: query, category, status, from, to, sort, page: 1 }).then(setResult).catch((err) => setError(errorText(err)))
    }
  }, [params])

  async function onExport(note, kind) {
    try {
      const full = await getNote(note.id)
      if (kind === 'pdf') await exportNotePdf(full)
      else downloadTextFile(noteExportFilename(full, 'txt'), buildNoteText(full))
      toast.push('Export downloaded.', 'success')
    } catch (err) {
      toast.push(errorText(err, 'The export failed.'), 'error')
    }
  }

  async function confirmDelete() {
    setBusy(true)
    try {
      await deleteNote(pendingDelete.id)
      setPendingDelete(null)
      toast.push('Note deleted.', 'success')
      load(page)
    } catch (err) {
      toast.push(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>My notes</h1>
          <p className="lede">Search, filter, and export the notes in your account.</p>
        </div>
      </header>
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search title or content"
        onSubmit={() => {
          setParams(search ? { q: search } : {})
          setPage(1)
          load(1)
        }}
      />
      <FilterControls
        filters={[
          { label: 'Category', value: category, onChange: setCategory, options: [{ value: 'all', label: 'All categories' }, ...CATEGORIES] },
          { label: 'Status', value: status, onChange: setStatus, options: [{ value: 'all', label: 'All statuses' }, ...PROCESSING_STATUSES] },
          { label: 'Sort', value: sort, onChange: setSort, options: [{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'title', label: 'Title' }] },
          { label: 'From', type: 'date', value: from, onChange: setFrom },
          { label: 'To', type: 'date', value: to, onChange: setTo },
        ]}
      />
      {loading ? <LoadingSpinner label="Loading notes" /> : null}
      <ErrorMessage message={error} onRetry={() => load(page)} />
      {!loading && result && !result.rows.length ? <EmptyState title="No notes match" message="Try another search or create a note from the dashboard." /> : null}
      <div className="card-grid">
        {result?.rows.map((note) => (
          <NoteCard key={note.id} note={note} onExport={onExport} onDelete={setPendingDelete} />
        ))}
      </div>
      {result ? (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          count={result.count}
          onPage={(next) => {
            setPage(next)
            load(next)
          }}
        />
      ) : null}
      <ConfirmationModal
        open={Boolean(pendingDelete)}
        title="Delete this note?"
        message="The note, its chat, and the link from related tasks will be removed. A stored recording is kept until you delete it from Audio history."
        confirmLabel="Delete note"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
