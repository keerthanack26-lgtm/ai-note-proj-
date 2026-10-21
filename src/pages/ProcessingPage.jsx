import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import ProcessingStatus from '../components/ProcessingStatus'
import { invokeFunction } from '../services/api'
import { prepareStoredAudioForTranscription } from '../services/audio'
import { createRetryJob, ensureTranscribeLanguage, getJob } from '../services/records'
import { errorText } from '../utils/errors'

export default function ProcessingPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const startedFor = useRef(null)

  async function refresh() {
    const next = await getJob(jobId)
    setJob(next)
    return next
  }

  async function advance(retry = false) {
    setRunning(true)
    setError('')
    try {
      const current = job || await refresh()
      await ensureTranscribeLanguage()
      if (retry && (current.retry_count || 0) >= 3) {
        const audioId = current.audio_file_id || current.audio_files?.id
        if (!audioId) throw new Error('The audio file for this job could not be found.')
        const next = await createRetryJob(audioId)
        navigate(`/processing/${next.id}`, { replace: true })
        return
      }
      let converted = false
      if (current?.audio_files) {
        const before = current.audio_files.storage_path
        const next = await prepareStoredAudioForTranscription(current.audio_files)
        converted = Boolean(next?.storage_path && next.storage_path !== before)
        await refresh()
      }
      let guard = 0
      while (guard < 6) {
        const result = await invokeFunction('process-audio', { jobId, retry: retry || converted })
        const latest = await refresh()
        retry = false
        if (result?.done || latest.status === 'completed' || latest.status === 'failed') break
        if (!result?.continue) break
        guard += 1
      }
    } catch (err) {
      setError(errorText(err, 'Processing failed.'))
      try {
        await refresh()
      } catch {
        /* the job row may already show the failure */
      }
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (startedFor.current === jobId) return undefined
    startedFor.current = jobId
    let cancelled = false
    refresh()
      .then((latest) => {
        if (cancelled) return
        if (latest.status === 'queued' || latest.status === 'failed') return
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'This processing job could not be loaded.'))
      })
    advance(false)
    return () => {
      cancelled = true
    }
  }, [jobId])

  const noteId = job?.note_id || job?.notes?.id || (Array.isArray(job?.notes) ? job.notes[0]?.id : null)
  const missingSecret = /not configured/i.test(error) || /not configured/i.test(job?.error_message || '')

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Processing</h1>
          <p className="lede">You can leave this page. The job stays saved and can be resumed from Audio history.</p>
        </div>
        {noteId && job?.status === 'completed' ? (
          <Link className="btn btn-primary" to={`/notes/${noteId}/edit`}>
            Open note
          </Link>
        ) : null}
      </header>
      {!job && !error ? <LoadingSpinner label="Loading job" /> : null}
      <ErrorMessage message={error} />
      {/not deployed/i.test(error) ? (
        <section className="card stack">
          <h2>Deploy process-audio once</h2>
          <p className="lede">
            The recording is saved. This project still needs the server function uploaded in the Supabase dashboard.
          </p>
          <ol className="steps" style={{ margin: 0 }}>
            <li className="step">
              <b>1</b>
              <p>
                Open{' '}
                <a href="https://supabase.com/dashboard/project/bxdnsyphkffensaojowa/functions" target="_blank" rel="noreferrer">
                  Edge Functions
                </a>
                , then click Deploy a new function → Via Editor.
              </p>
            </li>
            <li className="step">
              <b>2</b>
              <p>Name it exactly process-audio. Select all sample code, then press Ctrl+V. The function code is already copied.</p>
            </li>
            <li className="step">
              <b>3</b>
              <p>Click Deploy function. Come back here and click Resume.</p>
            </li>
          </ol>
        </section>
      ) : null}
      {missingSecret ? (
        <section className="card stack">
          <h2>Add the Gemini secret</h2>
          <p className="lede">
            Putting the key in the function code or on the JWT Settings page does not work. It must be a secret named
            exactly GEMINI_API_KEY.
          </p>
          <ol className="steps" style={{ margin: 0 }}>
            <li className="step">
              <b>1</b>
              <p>
                Open{' '}
                <a href="https://supabase.com/dashboard/project/bxdnsyphkffensaojowa/functions/secrets" target="_blank" rel="noreferrer">
                  Edge Function secrets
                </a>
                . That is the Secrets page, not Code and not Settings.
              </p>
            </li>
            <li className="step">
              <b>2</b>
              <p>
                You should see a row named exactly <code>GEMINI_API_KEY</code>. If that name is missing, click Add new
                secret, use that exact name, paste the Google AI Studio key as the value, and save.
              </p>
            </li>
            <li className="step">
              <b>3</b>
              <p>Come back here and click Retry.</p>
            </li>
          </ol>
        </section>
      ) : null}
      {job ? (
        <section className="card stack">
          <h2>{job.audio_files?.file_name || 'Audio file'}</h2>
          <ProcessingStatus stage={job.current_stage} status={job.status} errorMessage={job.error_message} />
          {running ? <p className="hint">Working on the current stage. This uses the real job status from the database.</p> : null}
          {job.status === 'failed' ? (
            <button className="btn btn-secondary" type="button" disabled={running} onClick={() => advance(true)}>
              Retry
            </button>
          ) : null}
          {job.status === 'queued' && !running ? (
            <button className="btn btn-primary" type="button" onClick={() => advance(false)}>
              Resume
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
