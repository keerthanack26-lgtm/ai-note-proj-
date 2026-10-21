export async function assertWithinRateLimit(service, userId) {
  const { data } = await service.from('application_settings').select('value').eq('key', 'ai_hourly_limit').maybeSingle()
  const limit = Number(data?.value ?? 30)
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await service
    .from('ai_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
  if (error) throw error
  if ((count || 0) >= limit) {
    const limitError = new Error('limit')
    limitError.code = 'rate_limited'
    throw limitError
  }
}

export async function recordUsage(service, row) {
  const { error } = await service.from('ai_usage_events').insert(row)
  if (error) console.log(JSON.stringify({ code: 'usage_log_failed' }))
}

export async function settingValue(service, key, fallback) {
  const { data } = await service.from('application_settings').select('value').eq('key', key).maybeSingle()
  return data?.value ?? fallback
}
