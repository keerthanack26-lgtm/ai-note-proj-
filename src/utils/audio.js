export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024

export const DEFAULT_ALLOWED_MIMES = [
  'audio/webm',
  'audio/weba',
  'audio/wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
]

const EXTENSIONS = {
  'audio/webm': 'webm',
  'audio/weba': 'weba',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
}

export function baseMime(type) {
  return String(type || '').split(';')[0].trim().toLowerCase()
}

export function extensionForMime(type) {
  return EXTENSIONS[baseMime(type)] || 'webm'
}

export function validateAudioFile(file, options = {}) {
  const maxBytes = Number(options.maxBytes) || DEFAULT_MAX_BYTES
  const allowed = (options.allowed?.length ? options.allowed : DEFAULT_ALLOWED_MIMES).map(baseMime)
  if (!file) return 'Choose an audio file.'
  const mime = baseMime(file.type)
  if (!mime || !allowed.includes(mime)) {
    return 'This audio format is not supported. Use WebM, WAV, MP3, M4A, or OGG.'
  }
  if (!file.size) return 'The selected file is empty.'
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024))
    return `This file is too large. The current limit is ${mb} MB.`
  }
  return ''
}

export function recordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

export function needsWavConversion(type, fileName = '') {
  const mime = baseMime(type)
  const name = String(fileName || '').toLowerCase()
  return mime === 'audio/webm' || mime === 'audio/weba' || mime === 'audio/ogg'
    || name.endsWith('.weba') || name.endsWith('.webm') || name.endsWith('.ogg')
}

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

export function isSilentSamples(samples, threshold = 0.008) {
  let peak = 0
  for (let index = 0; index < samples.length; index += 1) {
    const amplitude = Math.abs(samples[index])
    if (amplitude > peak) peak = amplitude
  }
  return peak < threshold
}

export function encodeWavBuffer(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate
  const channelCount = audioBuffer.numberOfChannels
  const frameCount = audioBuffer.length
  const samples = new Float32Array(frameCount)
  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = audioBuffer.getChannelData(channel)
    for (let index = 0; index < frameCount; index += 1) {
      samples[index] += data[index] / channelCount
    }
  }
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }
  return bytes
}

export async function convertToWavFile(file) {
  const Context = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null
  if (!Context) return file
  const context = new Context()
  try {
    const raw = await file.arrayBuffer()
    const buffer = await context.decodeAudioData(raw.slice(0))
    const silent = !buffer.length || Array.from({ length: buffer.numberOfChannels }, (_, channel) => (
      isSilentSamples(buffer.getChannelData(channel))
    )).every(Boolean)
    if (silent) {
      const error = new Error('This recording is silent. Check the microphone and record again.')
      error.code = 'empty_transcript'
      throw error
    }
    const wav = encodeWavBuffer(buffer)
    const base = String(file.name || 'recording').replace(/\.[^.]+$/, '')
    return new File([wav], `${base}.wav`, { type: 'audio/wav' })
  } catch {
    return file
  } finally {
    await context.close().catch(() => {})
  }
}

export async function ensureGeminiAudio(file) {
  if (!file || !needsWavConversion(file.type, file.name)) return file
  return convertToWavFile(file)
}
