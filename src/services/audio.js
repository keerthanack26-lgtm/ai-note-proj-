import { supabase } from '../lib/supabase'
import { baseMime, ensureGeminiAudio, extensionForMime, needsWavConversion } from '../utils/audio'

const BUCKET = 'voice-recordings'

function requireClient() {
  if (!supabase) {
    const error = new Error('Supabase is not configured in this browser app.')
    error.code = 'supabase_not_configured'
    throw error
  }
  return supabase
}

export function uploadWithProgress({ signedUrl, file, accessToken, apiKey, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('cacheControl', '3600')
    form.append('', file, file.name || 'recording.wav')
    xhr.open('PUT', signedUrl)
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.setRequestHeader('apikey', apiKey)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    const fail = (message, code) => {
      const error = new Error(message)
      error.code = code
      reject(error)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else fail('The audio upload failed. Check your connection and try again.', 'upload_failed')
    }
    xhr.onerror = () => fail('The network interrupted the upload.', 'network')
    xhr.onabort = () => fail('Upload cancelled.', 'cancelled')
    if (signal) {
      if (signal.aborted) xhr.abort()
      else signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(form)
  })
}

async function requireSession() {
  const client = requireClient()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) throw new Error('Your session has expired. Log in again.')
  const { data: sessionData } = await client.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Your session has expired. Log in again.')
  return { client, user: userData.user, accessToken }
}

export async function createAudioJob({ file, source, durationSeconds, onProgress, signal }) {
  const { client, user, accessToken } = await requireSession()
  const ready = await ensureGeminiAudio(file)
  const audioId = crypto.randomUUID()
  const mime = baseMime(ready.type) === 'audio/weba' || String(ready.name || '').toLowerCase().endsWith('.weba')
    ? 'audio/webm'
    : (baseMime(ready.type) || 'audio/webm')
  const path = `${user.id}/${audioId}.${extensionForMime(mime)}`
  onProgress?.(1)
  const { data: signed, error: signedError } = await client.storage.from(BUCKET).createSignedUploadUrl(path)
  if (signedError) throw new Error('A private upload link could not be created.')
  await uploadWithProgress({
    signedUrl: signed.signedUrl,
    file: ready,
    accessToken,
    apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    onProgress,
    signal,
  })

  const { data: audio, error: audioError } = await client
    .from('audio_files')
    .insert({
      id: audioId,
      user_id: user.id,
      file_name: ready.name || `recording-${audioId}.${extensionForMime(mime)}`,
      storage_path: path,
      mime_type: mime,
      file_size: ready.size,
      duration_seconds: durationSeconds ?? null,
      source,
    })
    .select()
    .single()
  if (audioError) {
    await client.storage.from(BUCKET).remove([path])
    throw audioError
  }

  const { data: job, error: jobError } = await client
    .from('processing_jobs')
    .insert({
      user_id: user.id,
      audio_file_id: audio.id,
      status: 'queued',
      current_stage: 'preparing',
    })
    .select()
    .single()
  if (jobError) throw jobError
  return job
}

export async function getSignedAudioUrl(storagePath) {
  const client = requireClient()
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 30)
  if (error) throw error
  return data.signedUrl
}

export async function prepareStoredAudioForTranscription(audio) {
  if (!audio?.storage_path) return audio
  if (!needsWavConversion(audio.mime_type, audio.file_name)) return audio
  const { client, user, accessToken } = await requireSession()
  const signedUrl = await getSignedAudioUrl(audio.storage_path)
  const response = await fetch(signedUrl)
  if (!response.ok) throw new Error('The saved recording could not be downloaded for conversion.')
  const blob = await response.blob()
  const source = new File([blob], audio.file_name || 'recording.weba', { type: audio.mime_type || 'audio/webm' })
  const wav = await convertOrFail(source)
  const nextPath = `${user.id}/${audio.id}.wav`
  const { data: signed, error: signedError } = await client.storage.from(BUCKET).createSignedUploadUrl(nextPath)
  if (signedError) throw new Error('A private upload link could not be created for the converted recording.')
  await uploadWithProgress({
    signedUrl: signed.signedUrl,
    file: wav,
    accessToken,
    apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  })
  const { data: updated, error: updateError } = await client
    .from('audio_files')
    .update({
      file_name: wav.name,
      storage_path: nextPath,
      mime_type: 'audio/wav',
      file_size: wav.size,
    })
    .eq('id', audio.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (updateError) throw updateError
  if (audio.storage_path !== nextPath) {
    await client.storage.from(BUCKET).remove([audio.storage_path]).catch(() => {})
  }
  return updated
}

async function convertOrFail(file) {
  const wav = await ensureGeminiAudio(file)
  if (baseMime(wav.type) !== 'audio/wav' && !String(wav.name || '').toLowerCase().endsWith('.wav')) {
    const error = new Error('This browser could not convert the .weba recording to WAV.')
    error.code = 'unsupported_audio_format'
    throw error
  }
  return wav
}

export async function readAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : null
      URL.revokeObjectURL(url)
      resolve(duration)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    audio.src = url
  })
}
