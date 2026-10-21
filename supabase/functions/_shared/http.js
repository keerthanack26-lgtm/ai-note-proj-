export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MESSAGES = {
  unauthorized: 'Log in to continue.',
  account_deactivated: 'This account is deactivated.',
  forbidden: 'You do not have access to this action.',
  ai_not_configured: 'Speech-to-text or the language model is not configured on the server.',
  unsupported_provider: 'The configured AI provider is not available in this deployment.',
  rate_limited: 'The hourly AI limit or the provider rate limit was reached. Try again later.',
  empty_transcript: 'No speech was detected in this audio.',
  invalid_ai_json: 'The AI response failed validation. You can retry.',
  missing_audio: 'The audio file could not be found in private storage.',
  file_too_large: 'This audio file exceeds the provider size limit.',
  timeout: 'The AI request timed out. You can retry.',
  payload_too_large: 'The request is too large.',
  invalid_json: 'The request could not be read.',
  invalid_action: 'That admin action is not supported.',
  empty_question: 'Enter a question about this note.',
  not_found: 'That item was not found in your account.',
  retry_exhausted: 'This job has reached the retry limit.',
  processing_failed: 'Processing failed. You can retry if the recording is still available.',
  provider_unavailable: 'The AI service is busy right now. Ask again in a moment.',
  unsupported_audio_format: 'Gemini could not read this audio file. Record again or upload a WAV, MP3, or M4A file.',
  invalid_setting: 'That setting value is not allowed.',
  retry_in_progress: 'A retry is already queued or running for this recording.',
  confirmation_required: 'Type DELETE to confirm account deletion.',
}

export function safeReason(value) {
  return String(value || '')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(api[_ ]?key|service[_ ]?role|secret)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

export function publicError(error) {
  const known = Boolean(MESSAGES[error?.code])
  const code = known ? error.code : 'processing_failed'
  const reason = safeReason(error?.publicDetail || (known ? '' : (error?.message || error?.details || error?.hint || '')))
  const base = MESSAGES[code]
  const message = reason ? `${base} ${reason}` : base
  return { code, message, status: error?.status || (code === 'unauthorized' ? 401 : code === 'forbidden' || code === 'account_deactivated' ? 403 : code === 'not_found' ? 404 : code === 'rate_limited' ? 429 : code === 'provider_unavailable' ? 503 : 400) }
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function fail(error) {
  const mapped = publicError(error)
  return json({ ok: false, error: { code: mapped.code, message: mapped.message } }, mapped.status)
}

export async function readBody(req, limit = 20000) {
  let raw = ''
  try {
    raw = await req.text()
  } catch {
    const error = new Error('body')
    error.code = 'invalid_json'
    error.publicDetail = 'The request body stream could not be read.'
    throw error
  }
  raw = String(raw || '').replace(/^\uFEFF/, '').trim()
  if (raw.length > limit) {
    const error = new Error('large')
    error.code = 'payload_too_large'
    throw error
  }
  if (!raw) return {}
  try {
    let parsed = JSON.parse(raw)
    // Some clients accidentally double-encode JSON objects as strings.
    if (typeof parsed === 'string') {
      const inner = parsed.trim()
      if (inner.startsWith('{') || inner.startsWith('[')) parsed = JSON.parse(inner)
      else return {}
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    const error = new Error('json')
    error.code = 'invalid_json'
    error.publicDetail = 'Body must be a JSON object.'
    throw error
  }
}

export function servePost(handler) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return fail(Object.assign(new Error('method'), { code: 'invalid_json', status: 405 }))
    try {
      return await handler(req)
    } catch (error) {
      const mapped = publicError(error)
      console.log(JSON.stringify({ code: mapped.code, detail: mapped.message }))
      return json({ ok: false, error: { code: mapped.code, message: mapped.message } }, mapped.status)
    }
  })
}
