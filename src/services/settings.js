import { supabase } from '../lib/supabase'
import { DEFAULT_ALLOWED_MIMES, DEFAULT_MAX_BYTES } from '../utils/audio'

export async function getSettingsMap() {
  if (!supabase) return null
  const { data, error } = await supabase.from('application_settings').select('key, value')
  if (error) throw error
  return Object.fromEntries((data || []).map((row) => [row.key, row.value]))
}

export function audioLimitsFromSettings(settings) {
  const maxBytes = Number(settings?.max_upload_bytes) || DEFAULT_MAX_BYTES
  const allowed = Array.isArray(settings?.allowed_mime_types) && settings.allowed_mime_types.length
    ? settings.allowed_mime_types
    : DEFAULT_ALLOWED_MIMES
  const maxRecordingSeconds = Number(settings?.max_recording_seconds) || 3600
  return { maxBytes, allowed, maxRecordingSeconds }
}
