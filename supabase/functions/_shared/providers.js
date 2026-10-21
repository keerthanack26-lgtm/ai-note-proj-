// Provider selection for speech-to-text (stt) and the language model (llm).
// This module has no Deno dependency so it can be unit tested. Pass a function
// that reads environment variables, such as (name) => Deno.env.get(name).

export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash'
export const GEMINI_DEFAULT_STT_MODEL = 'gemini-3.5-transcribe'
export const OPENAI_DEFAULT_LLM_MODEL = 'gpt-4o-mini'
export const OPENAI_DEFAULT_STT_MODEL = 'whisper-1'

export const SUPPORTED_PROVIDERS = ['gemini', 'openai']

const SECRET_NAMES = {
  gemini: { stt: 'GEMINI_API_KEY', llm: 'GEMINI_API_KEY' },
  openai: { stt: 'SPEECH_TO_TEXT_API_KEY', llm: 'LLM_API_KEY' },
}

function has(env, name) {
  return Boolean(String(env(name) || '').trim())
}

export function resolveProvider(kind, env) {
  const explicit = String(env(kind === 'stt' ? 'STT_PROVIDER' : 'LLM_PROVIDER') || '').trim().toLowerCase()
  let provider = explicit
  if (!provider) {
    if (kind === 'llm') provider = has(env, 'GEMINI_API_KEY') ? 'gemini' : 'openai'
    else provider = has(env, 'SPEECH_TO_TEXT_API_KEY') ? 'openai' : has(env, 'GEMINI_API_KEY') ? 'gemini' : 'openai'
  }
  const supported = SUPPORTED_PROVIDERS.includes(provider)
  const keyName = supported ? SECRET_NAMES[provider][kind] : null
  const defaultModel = provider === 'gemini'
    ? (kind === 'stt' ? GEMINI_DEFAULT_STT_MODEL : GEMINI_DEFAULT_MODEL)
    : kind === 'stt'
      ? OPENAI_DEFAULT_STT_MODEL
      : OPENAI_DEFAULT_LLM_MODEL
  const model = String(env(kind === 'stt' ? 'STT_MODEL' : 'LLM_MODEL') || '').trim() || defaultModel
  return {
    provider,
    supported,
    keyName,
    configured: supported && has(env, keyName),
    model,
  }
}

export function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((part) => !part?.thought && typeof part?.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim()
}

export function geminiLanguageHint(language) {
  const raw = String(language || '').trim()
  // Gemini 3.5 Transcribe only accepts full BCP-47 tags such as en-US.
  // App settings store short codes like "en", which make the API return 400.
  if (/^[a-z]{2}-[A-Za-z]{2}$/.test(raw)) return raw
  return ''
}

function collectTranscriptChunks(node, chunks, seen) {
  if (!node || typeof node !== 'object' || seen.has(node)) return
  seen.add(node)
  const transcription = node.audioTranscription || node.audio_transcription
  if (transcription && typeof transcription === 'object') {
    if (typeof transcription.text === 'string' && transcription.text.trim()) {
      chunks.push(transcription.text.trim())
    }
    if (Array.isArray(transcription.words)) {
      const line = transcription.words.map((word) => word?.word || word?.text || '').filter(Boolean).join(' ').trim()
      if (line) chunks.push(line)
    }
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectTranscriptChunks(item, chunks, seen))
    return
  }
  Object.values(node).forEach((value) => collectTranscriptChunks(value, chunks, seen))
}

export function extractGeminiTranscript(payload) {
  const text = extractGeminiText(payload)
  if (text) return text
  const chunks = []
  collectTranscriptChunks(payload, chunks, new Set())
  return chunks.join(' ').trim()
}

export function geminiUsage(payload) {
  const meta = payload?.usageMetadata || {}
  return {
    prompt_tokens: Number(meta.promptTokenCount) || null,
    completion_tokens: Number(meta.candidatesTokenCount) || null,
  }
}

export function geminiBlockedReason(payload) {
  if (payload?.promptFeedback?.blockReason) return String(payload.promptFeedback.blockReason)
  const finish = payload?.candidates?.[0]?.finishReason
  if (finish && !['STOP', 'MAX_TOKENS'].includes(finish)) return String(finish)
  return ''
}

// Gemini documents these audio types. Others may be rejected by the provider.
export const GEMINI_AUDIO_MIME = {
  'audio/wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/mpeg': 'audio/mp3',
  'audio/mp3': 'audio/mp3',
  'audio/aiff': 'audio/aiff',
  'audio/aac': 'audio/aac',
  'audio/ogg': 'audio/ogg',
  'audio/flac': 'audio/flac',
  'audio/m4a': 'audio/m4a',
  'audio/x-m4a': 'audio/m4a',
  'audio/mp4': 'audio/m4a',
  'audio/webm': 'audio/webm',
  'audio/weba': 'audio/webm',
  'audio/opus': 'audio/opus',
  'video/webm': 'audio/webm',
}

export function sniffGeminiAudio(bytes, mimeType, fileName = '') {
  const head = bytes || new Uint8Array()
  if (head.length >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 && head[8] === 0x57 && head[9] === 0x41 && head[10] === 0x56 && head[11] === 0x45) {
    return { mime: 'audio/wav', playable: true }
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return { mime: 'audio/webm', playable: true }
  }
  if (head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return { mime: 'audio/mp3', playable: true }
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return { mime: 'audio/mp3', playable: true }
  if (head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return { mime: 'audio/m4a', playable: true }
  if (head.length >= 4 && head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return { mime: 'audio/ogg', playable: true }
  return { mime: geminiAudioMime(mimeType, fileName).mime, playable: false }
}

export function geminiAudioMime(mimeType, fileName = '') {
  const base = String(mimeType || '').split(';')[0].trim().toLowerCase()
  const name = String(fileName || '').toLowerCase()
  if (GEMINI_AUDIO_MIME[base]) return { mime: GEMINI_AUDIO_MIME[base], documented: true }
  if (name.endsWith('.weba') || name.endsWith('.webm')) return { mime: 'audio/webm', documented: true }
  if (name.endsWith('.wav')) return { mime: 'audio/wav', documented: true }
  if (name.endsWith('.mp3')) return { mime: 'audio/mp3', documented: true }
  if (name.endsWith('.m4a') || name.endsWith('.mp4')) return { mime: 'audio/m4a', documented: true }
  if (name.endsWith('.ogg')) return { mime: 'audio/ogg', documented: true }
  return { mime: base || 'audio/webm', documented: Boolean(GEMINI_AUDIO_MIME[base]) }
}
