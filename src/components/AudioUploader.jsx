import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { filePickerAccept, validateAudioFile } from '../utils/audio'
import { formatBytes } from '../utils/format'

export default function AudioUploader({ maxBytes, allowed, busy, progress, onUpload, onCancel }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')

  async function choose(nextFile) {
    if (!nextFile) {
      setError('')
      setFile(null)
      return
    }
    let header = null
    if (typeof nextFile.slice === 'function') {
      try {
        header = new Uint8Array(await nextFile.slice(0, 32).arrayBuffer())
      } catch {
        header = null
      }
    }
    const message = validateAudioFile(nextFile, { maxBytes, allowed, header })
    setError(message)
    setFile(message ? null : nextFile)
  }

  return (
    <section className="card stack">
      <div
        className={`dropzone-box ${drag ? 'drag' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDrag(false)
          choose(event.dataTransfer.files?.[0])
        }}
      >
        <Upload />
        <h2>Drop an audio file</h2>
        <p className="hint">WebM, WAV, MP3, M4A, or OGG up to {formatBytes(maxBytes)}.</p>
        <button className="btn btn-secondary" type="button" onClick={() => inputRef.current?.click()}>
          Browse files
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept={filePickerAccept(allowed)}
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {file ? (
        <div className="stack">
          <strong>{file.name}</strong>
          <span className="hint">
            {formatBytes(file.size)} · {file.type || 'Unknown type'}
          </span>
          {typeof progress === 'number' ? (
            <div className="progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          <div className="card-actions">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => onUpload(file)}>
              {busy ? 'Uploading…' : 'Upload and process'}
            </button>
            {busy && onCancel ? (
              <button className="btn btn-ghost" type="button" onClick={onCancel}>
                Cancel upload
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
