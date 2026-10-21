import { useEffect, useMemo, useState } from 'react'
import ConfirmationModal from '../components/ConfirmationModal'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import FilterControls from '../components/FilterControls'
import LoadingSpinner from '../components/LoadingSpinner'
import Pagination from '../components/Pagination'
import SearchBar from '../components/SearchBar'
import TaskCard from '../components/TaskCard'
import { useToast } from '../context/ToastContext'
import { createTask, deleteTask, listTasks, updateTask } from '../services/records'
import { PRIORITIES, TASK_STATUSES } from '../utils/constants'
import { errorText } from '../utils/errors'
import { todayIso } from '../utils/format'

const BLANK = { title: '', description: '', priority: 'medium', status: 'pending', due_date: '', note_id: '' }

export default function TasksPage() {
  const toast = useToast()
  const [filters, setFilters] = useState({ search: '', status: 'all', priority: 'all', sort: 'newest', page: 1 })
  const [result, setResult] = useState(null)
  const [allForStats, setAllForStats] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(BLANK)
  const [editing, setEditing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  function load(next = filters) {
    setLoading(true)
    Promise.all([
      listTasks(next),
      listTasks({ page: 1, pageSize: 200, sort: 'due' }),
    ])
      .then(([pageResult, statsResult]) => {
        setResult(pageResult)
        setAllForStats(statsResult.rows)
        setError('')
      })
      .catch((err) => setError(errorText(err, 'Tasks could not be loaded.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [filters.status, filters.priority, filters.sort, filters.page])

  const stats = useMemo(() => {
    const today = todayIso()
    const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    return {
      total: allForStats.length,
      completed: allForStats.filter((task) => task.status === 'completed').length,
      overdue: allForStats.filter((task) => task.due_date && task.status !== 'completed' && task.due_date < today),
      upcoming: allForStats.filter((task) => task.due_date && task.status !== 'completed' && task.due_date >= today && task.due_date <= week),
    }
  }, [allForStats])

  async function saveTask(event) {
    event.preventDefault()
    if (form.title.trim().length < 2) {
      toast.push('Enter a task title.', 'error')
      return
    }
    setBusy(true)
    try {
      const payload = { ...form, due_date: form.due_date || null, note_id: form.note_id || null }
      if (editing) await updateTask(editing, payload)
      else await createTask(payload)
      setForm(BLANK)
      setEditing(null)
      toast.push(editing ? 'Task updated.' : 'Task created.', 'success')
      load()
    } catch (err) {
      toast.push(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(task, status) {
    try {
      await updateTask(task.id, { status })
      load()
    } catch (err) {
      toast.push(errorText(err), 'error')
    }
  }

  async function confirmDelete() {
    setBusy(true)
    try {
      await deleteTask(pendingDelete.id)
      setPendingDelete(null)
      load()
    } catch (err) {
      toast.push(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Tasks</h1>
        <p className="lede">
          {stats.completed} of {stats.total} loaded tasks are complete. Email and push reminders are unavailable.
        </p>
      </header>
      <section className="editor-grid">
        <article className="card">
          <h2>Overdue</h2>
          {stats.overdue.length ? stats.overdue.map((task) => <p key={task.id}>{task.title}</p>) : <p className="hint">No overdue tasks.</p>}
        </article>
        <article className="card">
          <h2>Upcoming this week</h2>
          {stats.upcoming.length ? stats.upcoming.map((task) => <p key={task.id}>{task.title}</p>) : <p className="hint">No upcoming deadlines.</p>}
        </article>
      </section>
      <form className="card form-grid" onSubmit={saveTask}>
        <h2>{editing ? 'Edit task' : 'Create a task'}</h2>
        <label className="field">
          <span>Title</span>
          <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea className="textarea" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <div className="filters">
          <label className="field">
            <span>Priority</span>
            <select className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              {PRIORITIES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {TASK_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Due date</span>
            <input className="input" type="date" value={form.due_date || ''} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
          </label>
        </div>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {editing ? 'Save task' : 'Create task'}
        </button>
      </form>
      <SearchBar
        value={filters.search}
        onChange={(search) => setFilters((current) => ({ ...current, search }))}
        placeholder="Search tasks"
        onSubmit={() => load({ ...filters, page: 1 })}
      />
      <FilterControls
        filters={[
          { label: 'Status', value: filters.status, onChange: (status) => setFilters((current) => ({ ...current, status, page: 1 })), options: [{ value: 'all', label: 'All statuses' }, ...TASK_STATUSES] },
          { label: 'Priority', value: filters.priority, onChange: (priority) => setFilters((current) => ({ ...current, priority, page: 1 })), options: [{ value: 'all', label: 'All priorities' }, ...PRIORITIES] },
          { label: 'Sort', value: filters.sort, onChange: (sort) => setFilters((current) => ({ ...current, sort, page: 1 })), options: [{ value: 'newest', label: 'Newest' }, { value: 'due', label: 'Due date' }, { value: 'priority', label: 'Priority' }] },
        ]}
      />
      {loading ? <LoadingSpinner label="Loading tasks" /> : null}
      <ErrorMessage message={error} onRetry={() => load()} />
      {!loading && result && !result.rows.length ? <EmptyState title="No tasks" message="Create one above, or add suggested tasks from a note." /> : null}
      <div className="card-grid">
        {result?.rows.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onStatus={changeStatus}
            onDelete={setPendingDelete}
            onEdit={(item) => {
              setEditing(item.id)
              setForm({
                title: item.title,
                description: item.description || '',
                priority: item.priority,
                status: item.status,
                due_date: item.due_date || '',
                note_id: item.note_id || '',
              })
            }}
          />
        ))}
      </div>
      {result ? <Pagination page={result.page} pageSize={result.pageSize} count={result.count} onPage={(page) => setFilters((current) => ({ ...current, page }))} /> : null}
      <ConfirmationModal
        open={Boolean(pendingDelete)}
        title="Delete this task?"
        message="The task is removed from your list. The related note stays."
        confirmLabel="Delete task"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
