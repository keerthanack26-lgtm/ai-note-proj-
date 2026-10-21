import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AudioUploader from '../components/AudioUploader'
import ErrorMessage from '../components/ErrorMessage'
import { createAudioJob, readAudioDuration } from '../services/audio'
import { audioLimitsFromSettings, getSettingsMap } from '../services/settings'
import { errorText } from '../utils/errors'

export default function UploadPage() {
  const navigate = useNavigate()
  const [limits, setLimits] = useState(audioLimitsFromSettings(null))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const abortRef = useRef(null)

  useEffect(() => {
    getSettingsMap()
      .then((settings) => setLimits(audioLimitsFromSettings(settings)))
      .catch(() => {})
  }, [])

  async function onUpload(file) {
    setError('')
    setBusy(true)
    setProgress(0)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const durationSeconds = await readAudioDuration(file)
      const job = await createAudioJob({
        file,
        source: 'upload',
        durationSeconds,
        onProgress: setProgress,
        signal: controller.signal,
      })
      navigate(`/processing/${job.id}`)
    } catch (err) {
      if (err.code !== 'cancelled') setError(errorText(err, 'The upload failed.'))
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Upload audio</h1>
        <p className="lede">Files are stored in a private bucket and can be cancelled before processing starts.</p>
      </header>
      <ErrorMessage message={error} />
      <AudioUploader
        maxBytes={limits.maxBytes}
        allowed={limits.allowed}
        busy={busy}
        progress={progress}
        onUpload={onUpload}
        onCancel={() => abortRef.current?.abort()}
      />
    </div>
  )
}
