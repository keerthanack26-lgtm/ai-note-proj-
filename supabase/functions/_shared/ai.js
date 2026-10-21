import {
  extractGeminiText,
  extractGeminiTranscript,
  geminiAudioMime,
  geminiBlockedReason,
  sniffGeminiAudio,
  geminiLanguageHint,
  geminiUsage,
  resolveProvider,
} from './providers.js'

const NOTE_SHAPE = `{
  "title": "short title from the transcript",
  "short_summary": "one or two sentences",
  "detailed_summary": "a fuller recap of only what was said",
  "key_points": ["point"],
  "decisions": [{"text": "decision", "confidence": "high"}],
  "action_items": [{"title": "task", "description": "details said in the audio", "priority": "medium", "due_date": null, "confidence": "low", "evidence": "exact short quote"}],
  "deadlines": [{"label": "what is due", "date": null, "confidence": "low", "evidence": "exact short quote"}],
  "language": "language of the transcript"
}`

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_INLINE_AUDIO_LIMIT = 14 * 1024 * 1024
const OPENAI_AUDIO_LIMIT = 25 * 1024 * 1024

const readEnv = (name) => Deno.env.get(name)

export function providerName(kind) {
  return resolveProvider(kind, readEnv).provider
}

function providerConfig(kind) {
  const resolved = resolveProvider(kind, readEnv)
  if (!resolved.supported) {
    const error = new Error('provider')
    error.code = 'unsupported_provider'
    throw error
  }
  const key = Deno.env.get(resolved.keyName)
  if (!key) {
    const error = new Error('key')
    error.code = 'ai_not_configured'
    throw error
  }
  return { provider: resolved.provider, key, model: resolved.model }
}

function geminiGenerationConfig(model, extra = {}) {
  const config = { ...extra }
  const name = String(model || '')
  if (/transcribe/i.test(name)) return config
  if (/gemini-[34]/.test(name)) config.thinkingConfig = { thinkingLevel: 'low' }
  return config
}

function safeDetail(text) {
  return String(text || '')
    .replace(/key[s]?\s*[:=]\s*\S+/gi, 'key=redacted')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .slice(0, 160)
}

async function throwProvider(response) {
  let detail = ''
  try {
    const body = await response.json()
    detail = String(body?.error?.message || body?.error?.status || '')
  } catch {
    await response.arrayBuffer().catch(() => null)
  }
  const lower = detail.toLowerCase()
  const formatError = /mime|unsupported.*audio|unable to process|audio format|inline_data|invalid argument/.test(lower)
  const code = response.status === 429
    ? 'rate_limited'
    : response.status === 503
      ? 'provider_unavailable'
      : response.status === 413
        ? 'file_too_large'
        : response.status === 401 || response.status === 403
          ? 'ai_not_configured'
          : response.status === 408 || response.status === 504
            ? 'timeout'
            : formatError
              ? 'unsupported_audio_format'
              : 'processing_failed'
  console.log(JSON.stringify({ providerStatus: response.status, code, detail: safeDetail(detail) }))
  const error = new Error('provider')
  error.code = code
  error.publicDetail = `Gemini HTTP ${response.status}${safeDetail(detail) ? `: ${safeDetail(detail)}` : ''}`
  throw error
}

function parseJsonContent(content) {
  try {
    return JSON.parse(content)
  } catch {
    const start = String(content || '').indexOf('{')
    const end = String(content || '').lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1))
    const error = new Error('parse')
    error.code = 'invalid_ai_json'
    throw error
  }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    const wrapped = new Error('timeout')
    wrapped.code = error?.name === 'TimeoutError' ? 'timeout' : 'processing_failed'
    wrapped.publicDetail = error?.name === 'TimeoutError' ? 'The Gemini request timed out.' : 'The Gemini request could not be sent.'
    throw wrapped
  }
}

async function completeOpenAi(key, model, messages, timeoutMs) {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.2, response_format: { type: 'json_object' }, messages }),
  }, timeoutMs)
  if (!response.ok) await throwProvider(response)
  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content || ''
  return { parsed: parseJsonContent(content), usage: payload.usage || {} }
}

const GEMINI_BUSY_FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']

function geminiBusy(error) {
  return error?.code === 'provider_unavailable' || error?.code === 'rate_limited' || /Gemini HTTP (?:500|502|503|504)/.test(String(error?.publicDetail || ''))
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function geminiGenerateOnce(key, model, body, timeoutMs) {
  const response = await fetchWithTimeout(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs)
  if (!response.ok) await throwProvider(response)
  const payload = await response.json()
  const blocked = geminiBlockedReason(payload)
  if (blocked) {
    console.log(JSON.stringify({ geminiFinish: blocked }))
    const error = new Error('blocked')
    error.code = 'processing_failed'
    error.publicDetail = `Gemini stopped the response (${blocked}).`
    throw error
  }
  return payload
}

async function geminiGenerate(key, model, body, timeoutMs, maxRetries = 2) {
  let attempt = 0
  while (true) {
    try {
      return await geminiGenerateOnce(key, model, body, timeoutMs)
    } catch (error) {
      if (!geminiBusy(error) || attempt >= maxRetries) throw error
      attempt += 1
      const delayMs = attempt * 1500
      console.log(JSON.stringify({ geminiRetry: model, code: error.code, attempt, delayMs }))
      await pause(delayMs)
    }
  }
}

async function completeGemini(key, model, messages, timeoutMs) {
  const system = messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n\n')
  const contents = messages
    .filter((item) => item.role !== 'system')
    .map((item) => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }] }))
  const models = [...new Set([model, ...GEMINI_BUSY_FALLBACKS])]
  let lastError
  for (const name of models) {
    try {
      const payload = await geminiGenerate(key, name, {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: geminiGenerationConfig(name, { responseMimeType: 'application/json' }),
      }, timeoutMs)
      if (name !== model) console.log(JSON.stringify({ geminiFallback: name }))
      return { parsed: parseJsonContent(extractGeminiText(payload)), usage: geminiUsage(payload), model: name }
    } catch (error) {
      lastError = error
      if (!geminiBusy(error) || name === models[models.length - 1]) throw error
      console.log(JSON.stringify({ geminiBusy: name, code: error.code }))
    }
  }
  throw lastError
}

async function complete(config, messages, timeoutMs) {
  if (config.provider === 'gemini') return completeGemini(config.key, config.model, messages, timeoutMs)
  return completeOpenAi(config.key, config.model, messages, timeoutMs)
}

function toBase64(bytes) {
  const parts = []
  const chunk = 4096
  for (let index = 0; index < bytes.length; index += chunk) {
    const slice = bytes.subarray(index, index + chunk)
    let binary = ''
    for (let offset = 0; offset < slice.length; offset += 1) binary += String.fromCharCode(slice[offset])
    parts.push(binary)
  }
  return btoa(parts.join(''))
}

async function transcribeOpenAi({ key, model, bytes, mimeType, fileName, language }) {
  if (bytes.byteLength > OPENAI_AUDIO_LIMIT) {
    const error = new Error('size')
    error.code = 'file_too_large'
    throw error
  }
  async function send(includeHints) {
    const form = new FormData()
    form.append('file', new File([bytes], fileName || 'audio.webm', { type: mimeType || 'audio/webm' }))
    form.append('model', model)
    form.append('response_format', 'verbose_json')
    if (includeHints) {
      form.append('timestamp_granularities[]', 'segment')
      if (language) form.append('language', language)
    }
    const response = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    }, 120000)
    if (!response.ok) await throwProvider(response)
    return response.json()
  }
  let payload
  try {
    payload = await send(true)
  } catch (error) {
    if (error.code === 'processing_failed') payload = await send(false)
    else throw error
  }
  const segments = Array.isArray(payload.segments)
    ? payload.segments.slice(0, 500).map((segment) => ({
      start: Number(segment.start) || 0,
      end: Number(segment.end) || 0,
      text: String(segment.text || '').trim(),
    })).filter((segment) => segment.text)
    : []
  return {
    text: String(payload.text || '').trim(),
    language: payload.language || null,
    duration: Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : null,
    segments,
    provider: 'openai',
    model,
  }
}

function transcriptFromGemini(payload) {
  const raw = extractGeminiTranscript(payload).trim()
  if (!raw) {
    const parts = payload?.candidates?.[0]?.content?.parts
    console.log(JSON.stringify({
      emptyTranscript: true,
      finish: payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason || '',
      partKeys: Array.isArray(parts) ? parts.map((part) => Object.keys(part || {})) : [],
    }))
    const error = new Error('empty')
    error.code = 'empty_transcript'
    throw error
  }
  try {
    const parsed = parseJsonContent(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
      return {
        text: parsed.text.trim(),
        language: parsed.language ? String(parsed.language).slice(0, 10) : null,
      }
    }
  } catch {
    /* Gemini often returns plain transcript text */
  }
  return { text: raw, language: null }
}

async function transcribeGemini({ key, model, bytes, mimeType, fileName, language }) {
  if (bytes.byteLength > GEMINI_INLINE_AUDIO_LIMIT) {
    const error = new Error('size')
    error.code = 'file_too_large'
    throw error
  }
  const sniffed = sniffGeminiAudio(bytes, mimeType, fileName)
  if (!sniffed.playable) {
    const invalid = new Error('audio')
    invalid.code = 'unsupported_audio_format'
    invalid.publicDetail = 'The saved file does not start with WAV, WebM, MP3, M4A, or OGG audio. Record it again.'
    throw invalid
  }
  const { mime } = sniffed.playable ? sniffed : geminiAudioMime(mimeType, fileName)
  const sttModel = /transcribe/i.test(model) ? model : 'gemini-3.5-transcribe'
  const languageCode = geminiLanguageHint(language)
  console.log(JSON.stringify({
    transcribe: 'gemini',
    model: sttModel,
    mime,
    bytes: bytes.byteLength,
    fileName: String(fileName || '').slice(0, 80),
    language: 'auto',
  }))
  const audioPart = { inlineData: { mimeType: mime, data: toBase64(bytes) } }
  try {
    const payload = await geminiGenerate(key, sttModel, {
      contents: [{ parts: [audioPart] }],
    }, 120000)
    const parsed = transcriptFromGemini(payload)
    return {
      text: parsed.text,
      language: parsed.language || languageCode || null,
      duration: null,
      segments: [],
      provider: 'gemini',
      model: sttModel,
    }
  } catch (error) {
    if (['ai_not_configured', 'rate_limited', 'file_too_large'].includes(error.code)) throw error
    if (error.publicDetail && /does not start with/.test(error.publicDetail)) throw error
    console.log(JSON.stringify({ transcribeFallback: error.code || 'unknown', detail: String(error.publicDetail || '').slice(0, 160) }))
    try {
      const fallback = await geminiGenerate(key, 'gemini-3.8-flash', {
        contents: [{
          parts: [
            audioPart,
            { text: 'Transcribe the spoken words in this audio. Return only the transcript.' },
          ],
        }],
        generationConfig: geminiGenerationConfig('gemini-3.8-flash'),
      }, 120000)
      const parsed = transcriptFromGemini(fallback)
      return {
        text: parsed.text,
        language: parsed.language || languageCode || null,
        duration: null,
        segments: [],
        provider: 'gemini',
        model: 'gemini-3.8-flash',
      }
    } catch (fallbackError) {
      if (error.publicDetail && !String(fallbackError.publicDetail || '').includes(error.publicDetail)) {
        fallbackError.publicDetail = `${fallbackError.publicDetail || ''} First attempt: ${error.publicDetail}`.trim()
      }
      throw fallbackError
    }
  }
}

export async function transcribeAudio({ bytes, mimeType, fileName, language }) {
  const config = providerConfig('stt')
  if (config.provider === 'gemini') return transcribeGemini({ ...config, bytes, mimeType, fileName, language })
  return transcribeOpenAi({ ...config, bytes, mimeType, fileName, language })
}

export async function generateNotes({ transcript, style, errors }) {
  const config = providerConfig('llm')
  const clipped = transcript.slice(0, 24000)
  const repair = errors?.length ? `The previous JSON failed validation: ${errors.join('; ')}. Return corrected JSON only.` : ''
  const result = await complete(config, [
    {
      role: 'system',
      content: `You extract notes from a transcript. Use only facts present in the transcript. If a name, date, decision, or commitment is not explicit, leave it out or mark confidence as low and use null for the date. Do not guess a calendar date from a relative phrase. Evidence must be a short exact quote from the transcript. Summary style: ${style || 'balanced'}. ${repair} Respond as JSON with this shape: ${NOTE_SHAPE}`,
    },
    { role: 'user', content: clipped },
  ], 60000)
  return { ...result, provider: config.provider, model: result.model || config.model, truncated: transcript.length > clipped.length }
}

export async function answerQuestion({ note, question, history }) {
  const config = providerConfig('llm')
  const context = JSON.stringify({
    title: note.title,
    transcript: String(note.transcript || '').slice(0, 24000),
    short_summary: note.short_summary,
    detailed_summary: note.detailed_summary,
    key_points: note.key_points,
    decisions: note.decisions,
    action_items: note.action_items,
    deadlines: note.deadlines,
  })
  const messages = [
    {
      role: 'system',
      content: 'Answer only from the supplied note JSON. If the note does not contain the answer, say that clearly and set missing_information to true. Do not claim you sent a reminder, created a calendar event, or completed a task. Respond as JSON: {"answer":"","grounded":true,"missing_information":false}',
    },
    { role: 'user', content: `Note:\n${context}` },
    ...history.map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '').slice(0, 2000) })),
    { role: 'user', content: question },
  ]
  const result = await complete(config, messages, 45000)
  return { ...result, provider: config.provider, model: result.model || config.model }
}
