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

export const SUPPORTED_EXTENSIONS = new Set([
  'webm',
  'weba',
  'wav',
  'wave',
  'mp3',
  'm4a',
  'mp4',
  'aac',
  'ogg',
  'oga',
  'opus',
])

const MIME_ALIASES = {
  // WebM
  'audio/webm': 'audio/webm',
  'audio/weba': 'audio/webm',
  'video/webm': 'audio/webm',
  'audio/x-webm': 'audio/webm',
  // WAV
  'audio/wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/vnd.wav': 'audio/wav',
  'audio/x-pn-wav': 'audio/wav',
  'application/x-wav': 'audio/wav',
  'audio/riff': 'audio/wav',
  // MP3
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/mpg': 'audio/mpeg',
  'audio/x-mpg': 'audio/mpeg',
  'audio/x-mpeg-3': 'audio/mpeg',
  // M4A / AAC / MP4
  'audio/mp4': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/aac': 'audio/mp4',
  'audio/x-aac': 'audio/mp4',
  'audio/aacp': 'audio/mp4',
  'audio/mp4a-latm': 'audio/mp4',
  'audio/x-mp4a-latm': 'audio/mp4',
  'video/mp4': 'audio/mp4',
  'video/quicktime': 'audio/mp4',
  // OGG
  'audio/ogg': 'audio/ogg',
  'application/ogg': 'audio/ogg',
  'audio/vorbis': 'audio/ogg',
  'audio/opus': 'audio/ogg',
  'audio/x-opus': 'audio/ogg',
  'audio/x-ogg': 'audio/ogg',
  'application/x-ogg': 'audio/ogg',
  'audio/x-vorbis+ogg': 'audio/ogg',
  'audio/x-opus+ogg': 'audio/ogg',
}

const EXTENSIONS = {
  'audio/webm': 'webm',
  'audio/weba': 'webm',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
}

export const EXT_TO_MIME = {
  webm: 'audio/webm',
  weba: 'audio/webm',
  wav: 'audio/wav',
  wave: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
}

export function baseMime(type) {
  return String(type || '').split(';')[0].trim().toLowerCase()
}

export function fileExtension(name) {
  const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

export function canonicalMime(type) {
  return MIME_ALIASES[baseMime(type)] || ''
}

export function mimeFromName(name) {
  return EXT_TO_MIME[fileExtension(name)] || ''
}

export function extensionForMime(type) {
  const mime = canonicalMime(type) || baseMime(type)
  return EXTENSIONS[mime] || 'webm'
}

export function hasNonAudioSignature(bytes) {
  const head = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  if (head.length < 4) return false
  // PNG: 89 50 4E 47
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true
  // PDF: %PDF (25 50 44 46)
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return true
  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true
  // GIF: GIF8
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return true
  // ZIP: PK 03 04
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return true
  // Windows EXE / PE: MZ
  if (head[0] === 0x4d && head[1] === 0x5a) return true
  return false
}

export function resolveAudioMime(file, headerBytes = null) {
  if (!file) return ''
  const ext = fileExtension(file.name)
  const fromName = EXT_TO_MIME[ext] || ''
  const fromType = canonicalMime(file.type)
  const sniffed = headerBytes ? sniffAudioMime(headerBytes) : ''

  if (sniffed) return sniffed

  const raw = baseMime(file.type)
  if ((raw === 'video/mp4' || raw === 'video/quicktime' || raw === 'application/octet-stream') && fromName) {
    return fromName
  }

  return fromType || fromName
}

export function isAllowedMime(mime, allowed, ext = '') {
  const resolved = canonicalMime(mime) || baseMime(mime)
  const extMime = ext ? (EXT_TO_MIME[ext] || '') : ''

  const allowedCanonical = (allowed || DEFAULT_ALLOWED_MIMES).map((item) => {
    const raw = String(item || '').toLowerCase().trim()
    const cleanExt = raw.replace(/^\./, '')
    if (EXT_TO_MIME[cleanExt]) return EXT_TO_MIME[cleanExt]
    return canonicalMime(raw) || baseMime(raw)
  }).filter(Boolean)

  if (resolved && allowedCanonical.includes(resolved)) return true
  if (extMime && allowedCanonical.includes(extMime)) return true
  return false
}

export function filePickerAccept(allowed = DEFAULT_ALLOWED_MIMES) {
  const extensions = ['.webm', '.weba', '.wav', '.wave', '.mp3', '.m4a', '.mp4', '.aac', '.ogg', '.oga', '.opus']
  const mimes = [...new Set([...(allowed || []), ...Object.keys(MIME_ALIASES)])]
  return [...extensions, 'audio/*', ...mimes].join(',')
}

export function sniffAudioMime(bytes) {
  const head = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  if (head.length >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 && head[8] === 0x57 && head[9] === 0x41 && head[10] === 0x56 && head[11] === 0x45) {
    return 'audio/wav'
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'audio/webm'
  if (head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return 'audio/mpeg'
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  if (head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return 'audio/mp4'
  if (head.length >= 4 && head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return 'audio/ogg'
  return ''
}

export async function prepareAudioFile(file) {
  if (!file) return file
  let header = null
  if (typeof file.slice === 'function') {
    try {
      header = new Uint8Array(await file.slice(0, 32).arrayBuffer())
    } catch {
      header = null
    }
  }
  let mime = resolveAudioMime(file, header)
  if (!mime && header) {
    mime = sniffAudioMime(header)
  }
  if (!mime) mime = 'audio/webm'

  const ext = fileExtension(file.name) || extensionForMime(mime)
  const base = String(file.name || 'upload').replace(/\.[^.]+$/, '')
  const name = `${base}.${ext}`

  if (baseMime(file.type) === mime && file.name === name) return file
  return new File([file], name, { type: mime, lastModified: file.lastModified })
}

export function validateAudioFile(file, options = {}) {
  const maxBytes = Number(options.maxBytes) || DEFAULT_MAX_BYTES
  const allowed = (options.allowed?.length ? options.allowed : DEFAULT_ALLOWED_MIMES).map(baseMime)
  if (!file) return 'Choose an audio file.'

  const header = options.header || null
  if (header && hasNonAudioSignature(header)) {
    return 'This audio format is not supported. Use WebM, WAV, MP3, M4A, or OGG.'
  }

  const ext = fileExtension(file.name)
  const mime = resolveAudioMime(file, header) || canonicalMime(file.type)

  const isSupportedExt = SUPPORTED_EXTENSIONS.has(ext)
  const isAllowed = (mime && isAllowedMime(mime, allowed, ext)) || (isSupportedExt && (!header || !hasNonAudioSignature(header)))

  if (!isAllowed) {
    return 'This audio format is not supported. Use WebM, WAV, MP3, M4A, or OGG.'
  }
  if (file.size !== undefined && !file.size) return 'The selected file is empty.'
  if (file.size && file.size > maxBytes) {
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
  return mime === 'audio/webm' || mime === 'audio/weba'
    || name.endsWith('.weba') || name.endsWith('.webm')
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
