import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { reportIssue } from '../services/records'
import { errorText } from '../utils/errors'

export default function ReportIssuePage() {
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    if (subject.trim().length < 5) return toast.push('Use a subject of at least 5 characters.', 'error')
    if (description.trim().length < 10) return toast.push('Describe the issue in at least 10 characters.', 'error')
    setBusy(true)
    try {
      await reportIssue(subject.trim(), description.trim())
      setSubject('')
      setDescription('')
      toast.push('Issue reported. An administrator can review the report, not your notes.', 'success')
    } catch (err) {
      toast.push(errorText(err, 'The report could not be sent.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="page" onSubmit={onSubmit}>
      <header>
        <h1>Report an issue</h1>
        <p className="lede">Describe what went wrong. Do not paste private transcripts unless you want an administrator to read this report.</p>
      </header>
      <label className="field">
        <span>Subject</span>
        <input className="input" maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} required />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea className="textarea" maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} required />
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Submit report'}
      </button>
      <Link to="/settings">Back to settings</Link>
    </form>
  )
}
