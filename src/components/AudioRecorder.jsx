import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Square } from 'lucide-react'
import { recordingMimeType } from '../utils/audio'
import { formatDuration } from '../utils/format'

export default function AudioRecorder({ maxSeconds = 3600, onSave, busy = false }) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [previewUrl, setPreviewUrl] = useState('')
  const [blob, setBlob] = useState(null)
  const [mimeType, setMimeType] = useState('')
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const frameRef = useRef(null)
  const audioContextRef = useRef(null)

  useEffect(() => () => stopTracks(), [])

  function stopTracks() {
    clearInterval(timerRef.current)
    cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
  }

  function watchLevel(stream) {
    const context = new AudioContext()
    audioContextRef.current = context
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      data.forEach((value) => {
        const centered = (value - 128) / 128
        sum += centered * centered
      })
      setLevel(Math.min(100, Math.round(Math.sqrt(sum / data.length) * 220)))
      frameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  async function start() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Upload a file instead.')
      return
    }
    const mime = recordingMimeType()
    if (!mime) {
      setError('This browser has no supported recording format. Upload a WebM, WAV, MP3, M4A, or OGG file.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const nextBlob = new Blob(chunksRef.current, { type: mime })
        setBlob(nextBlob)
        setMimeType(mime)
        setPreviewUrl(URL.createObjectURL(nextBlob))
        setStatus('preview')
        stopTracks()
      }
      recorder.start()
      setStatus('recording')
      setSeconds(0)
      watchLevel(stream)
      timerRef.current = setInterval(() => {
        setSeconds((current) => {
          if (current + 1 >= maxSeconds) {
            recorder.stop()
            return current + 1
          }
          return current + 1
        })
      }, 1000)
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        setError('Microphone access was denied. Allow the microphone or upload an audio file.')
      } else {
        setError('The microphone could not be started.')
      }
    }
  }

  function pause() {
    if (recorderRef.current?.state === 'recording' && typeof recorderRef.current.pause === 'function') {
      recorderRef.current.pause()
      clearInterval(timerRef.current)
      setStatus('paused')
    }
  }

  function resume() {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume()
      setStatus('recording')
      timerRef.current = setInterval(() => setSeconds((current) => current + 1), 1000)
    }
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    setBlob(null)
    setSeconds(0)
    setLevel(0)
    setStatus('idle')
  }

  const canPause = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype?.pause === 'function'

  return (
    <section className="card recorder">
      <div className="meta">
        <Mic size={18} />
        <strong>{status === 'idle' ? 'Ready' : status}</strong>
      </div>
      <div className="timer" aria-live="polite">
        {formatDuration(seconds)}
      </div>
      <div className="level" aria-hidden="true">
        <span style={{ width: `${status === 'recording' ? level : 0}%` }} />
      </div>
      <p className="hint">Recording stops automatically at {formatDuration(maxSeconds)}. Pause and resume depend on this browser.</p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="card-actions">
        {status === 'idle' ? (
          <button className="btn btn-primary" type="button" onClick={start}>
            <Mic size={16} /> Start
          </button>
        ) : null}
        {status === 'recording' && canPause ? (
          <button className="btn btn-ghost" type="button" onClick={pause}>
            <Pause size={16} /> Pause
          </button>
        ) : null}
        {status === 'paused' ? (
          <button className="btn btn-ghost" type="button" onClick={resume}>
            <Play size={16} /> Resume
          </button>
        ) : null}
        {status === 'recording' || status === 'paused' ? (
          <button className="btn btn-secondary" type="button" onClick={stop}>
            <Square size={16} /> Stop
          </button>
        ) : null}
      </div>
      {previewUrl ? (
        <div className="stack">
          <audio controls src={previewUrl} />
          <div className="card-actions">
            <button className="btn btn-ghost" type="button" onClick={discard} disabled={busy}>
              Discard
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !blob}
              onClick={() => onSave({ blob, mimeType, durationSeconds: seconds })}
            >
              {busy ? 'Saving…' : 'Save recording'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
