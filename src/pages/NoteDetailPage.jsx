import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import SummaryCard from '../components/SummaryCard'
import TranscriptViewer from '../components/TranscriptViewer'
import { useToast } from '../context/ToastContext'
import { invokeFunction } from '../services/api'
import { getSettingsMap } from '../services/settings'
import { listChat, getNote } from '../services/records'
import { SUGGESTED_QUESTIONS } from '../utils/constants'
import { errorText } from '../utils/errors'

export default function NoteDetailPage() {
  const { noteId } = useParams()
  const toast = useToast()
  const [note, setNote] = useState(null)
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')
  const [chatError, setChatError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [limit, setLimit] = useState(2000)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([getNote(noteId), listChat(noteId), getSettingsMap().catch(() => null)])
      .then(([noteRow, history, settings]) => {
        if (!active) return
        setNote(noteRow)
        setMessages(history)
        if (settings?.chat_max_input_chars) setLimit(Number(settings.chat_max_input_chars))
        setError('')
      })
      .catch((err) => {
        if (active) setError(errorText(err, 'This note could not be opened.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [noteId])

  async function send(text) {
    const content = (text ?? question).trim()
    if (!content) return
    if (content.length > limit) {
      setChatError(`Keep questions under ${limit} characters.`)
      return
    }
    setSending(true)
    setChatError('')
    setQuestion('')
    const optimistic = { id: `local-${Date.now()}`, role: 'user', content }
    setMessages((current) => [...current, optimistic])
    try {
      const result = await invokeFunction('chat-with-note', { noteId, question: content })
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        { id: `user-${Date.now()}`, role: 'user', content },
        {
          id: result.messageId || `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          grounded: result.grounded,
          missing: result.missingInformation,
        },
      ])
    } catch (err) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id))
      setQuestion(content)
      setChatError(errorText(err, 'The chat request failed.'))
    } finally {
      setSending(false)
    }
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(note?.short_summary || '')
      toast.push('Summary copied.', 'success')
    } catch {
      toast.push('Copy failed in this browser.', 'error')
    }
  }

  if (loading) return <LoadingSpinner label="Loading note" />

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{note?.title || 'Note'}</h1>
          <p className="lede">Questions are answered from this note only.</p>
        </div>
        <Link className="btn btn-secondary" to={`/notes/${noteId}/edit`}>
          Edit note
        </Link>
      </header>
      <ErrorMessage message={error} />
      {note ? (
        <div className="editor-grid">
          <div className="stack">
            <SummaryCard title="Summary" actions={<button className="btn btn-ghost btn-small" type="button" onClick={copySummary}>Copy</button>}>
              <p>{note.short_summary || 'No summary yet.'}</p>
              <p>{note.detailed_summary}</p>
            </SummaryCard>
            <SummaryCard title="Transcript">
              <TranscriptViewer transcript={note.transcript} segments={note.segments} readOnly />
            </SummaryCard>
          </div>
          <section className="card chat">
            <h2>Chat with this note</h2>
            <div className="suggestions">
              {SUGGESTED_QUESTIONS.map((item) => (
                <button key={item} className="btn btn-ghost btn-small" type="button" disabled={sending} onClick={() => send(item)}>
                  {item}
                </button>
              ))}
            </div>
            <div className="chat-log">
              {messages.length ? (
                messages.map((message) => (
                  <div key={message.id} className={`bubble ${message.role === 'user' ? 'bubble-user' : 'bubble-assistant'}`}>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>
                    {message.missing || message.missing_information ? (
                      <span className="badge badge-warning">Not found in this note</span>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="hint">Ask about the main points, tasks, or deadlines in this note.</p>
              )}
            </div>
            <ErrorMessage message={chatError} />
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault()
                send()
              }}
            >
              <textarea className="textarea" maxLength={limit} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this note" />
              <button className="btn btn-primary" type="submit" disabled={sending}>
                {sending ? 'Thinking…' : 'Send'}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  )
}
