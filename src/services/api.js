import { supabase } from '../lib/supabase'

async function projectReachable() {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    })
    return response.ok
  } catch {
    return false
  }
}

export async function invokeFunction(name, body) {
  if (!supabase) {
    const error = new Error('Supabase is not configured in this browser app.')
    error.code = 'supabase_not_configured'
    throw error
  }
  // Send an explicit JSON string so the Edge Function always receives a readable body.
  // Passing a plain object is usually fine, but some gateway/client combinations have
  // dropped or mis-encoded the payload and surfaced as invalid_json 400s.
  const payload = body === undefined || body === null ? {} : body
  const { data, error } = await supabase.functions.invoke(name, {
    headers: { 'Content-Type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
  if (error) {
    let payload = null
    const status = error.context?.status
    try {
      if (error.context && typeof error.context.clone === 'function') {
        payload = await error.context.clone().json()
      } else if (error.context && typeof error.context.json === 'function') {
        payload = await error.context.json()
      }
    } catch {
      try {
        const text = typeof error.context?.text === 'function' ? await error.context.text() : ''
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = null
      }
    }
    if (status === 404 && !payload?.error) {
      const missing = new Error(`The server function "${name}" is not deployed to this Supabase project yet. Deploy the Edge Functions and set the AI secret (README steps 8 and 9).`)
      missing.code = 'function_not_deployed'
      throw missing
    }
    if (error.name === 'FunctionsFetchError') {
      // A missing function answers the CORS preflight with a bare 404, which the
      // browser reports as a fetch failure. Probe the project to tell the two apart.
      if (await projectReachable()) {
        const missing = new Error(`The server function "${name}" is not deployed to this Supabase project yet. Deploy the Edge Functions (README step 9) and then click Resume.`)
        missing.code = 'function_not_deployed'
        throw missing
      }
      const offline = new Error('Supabase could not be reached. Check your internet connection and try again.')
      offline.code = 'network'
      throw offline
    }
    const wrapped = new Error(payload?.error?.message || 'The server could not complete this action.')
    wrapped.code = payload?.error?.code || 'request_failed'
    console.warn(`Edge function ${name} failed (${status || 'unknown'}): ${wrapped.code}: ${wrapped.message}`)
    throw wrapped
  }
  if (data?.ok === false) {
    const wrapped = new Error(data.error?.message || 'The server could not complete this action.')
    wrapped.code = data.error?.code || 'request_failed'
    throw wrapped
  }
  return data?.data
}
