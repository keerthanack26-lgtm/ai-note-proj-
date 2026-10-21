import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AudioRecorder from '../components/AudioRecorder'
import ErrorMessage from '../components/ErrorMessage'
import { createAudioJob } from '../services/audio'
import { audioLimitsFromSettings, getSettingsMap } from '../services/settings'
import { baseMime } from '../utils/audio'
import { errorText } from '../utils/errors'

export default function RecordPage() {
  const navigate = useNavigate()
  const [limits, setLimits] = useState(audioLimitsFromSettings(null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSettingsMap()
      .then((settings) => setLimits(audioLimitsFromSettings(settings)))
      .catch(() => {})
  }, [])

  async function onSave({ blob, mimeType, durationSeconds }) {
    setError('')
    const file = new File([blob], `recording-${Date.now()}.${mimeType.includes('mp4') ? 'm4a' : 'webm'}`, {
      type: baseMime(mimeType) || 'audio/webm',
    })
    if (file.size > limits.maxBytes) {
      setError('This recording is larger than the upload limit. Record a shorter clip or upload a smaller file.')
      return
    }
    setBusy(true)
    try {
      const job = await createAudioJob({ file, source: 'recording', durationSeconds, onProgress: () => {} })
      navigate(`/processing/${job.id}`)
    } catch (err) {
      if (err.code !== 'cancelled') setError(errorText(err, 'The recording could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Record audio</h1>
        <p className="lede">Speak, preview the clip, then save it to your private library for transcription.</p>
      </header>
      <ErrorMessage message={error} />
      <AudioRecorder maxSeconds={limits.maxRecordingSeconds} busy={busy} onSave={onSave} />
    </div>
  )
}
