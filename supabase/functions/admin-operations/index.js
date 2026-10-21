import { requireAdmin, requireUser } from '../_shared/auth.js'
import { json, readBody, servePost } from '../_shared/http.js'
import { resolveProvider } from '../_shared/providers.js'

const PAGE_SIZE = 12
const ALLOWED_MIME = ['audio/webm', 'audio/wav', 'audio/wave', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/ogg']
const ISSUE_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed']
const JOB_STATUSES = ['queued', 'processing', 'completed', 'failed']
const SETTING_RULES = {
  max_upload_bytes: (value) => Number.isInteger(value) && value >= 1048576 && value <= 26214400,
  allowed_mime_types: (value) => Array.isArray(value) && value.length > 0 && value.every((item) => ALLOWED_MIME.includes(item)),
  ai_hourly_limit: (value) => Number.isInteger(value) && value >= 1 && value <= 200,
  chat_max_input_chars: (value) => Number.isInteger(value) && value >= 100 && value <= 8000,
  chat_history_enabled: (value) => typeof value === 'boolean',
  max_recording_seconds: (value) => Number.isInteger(value) && value >= 30 && value <= 7200,
  processing_retry_limit: (value) => Number.isInteger(value) && value >= 0 && value <= 50,
  audio_retention_days: (value) => Number.isInteger(value) && value >= 1 && value <= 365,
  default_preferred_language: (value) => typeof value === 'string' && value.length >= 2 && value.length <= 16,
  default_summary_style: (value) => ['concise', 'balanced', 'detailed'].includes(value),
  usage_warning_threshold: (value) => Number.isInteger(value) && value >= 1 && value <= 100,
  maintenance_mode: (value) => typeof value === 'boolean',
}

servePost(async (req) => {
  // Read the body before any early returns so the gateway never sees an unread stream,
  // and so auth helpers cannot accidentally leave us with an empty payload.
  const body = await readBody(req, 40000)
  const { user, profile, service } = await requireUser(req)
  requireAdmin(profile)
  const page = Math.max(1, Number(body.page) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const range = parseRange(body)
  const action = String(body.action || '').trim()

  if (action === 'overview') return json({ ok: true, data: await overview(service, range) })
  if (action === 'analytics') return json({ ok: true, data: await analytics(service, range) })
  if (action === 'list-users') return json({ ok: true, data: await listUsers(service, body, from, to, page) })
  if (action === 'get-user') return json({ ok: true, data: await getUser(service, body) })
  if (action === 'set-status') return json({ ok: true, data: await setStatus(service, user.id, body) })
  if (action === 'set-role') return json({ ok: true, data: await setRole(service, user.id, body) })
  if (action === 'list-jobs') return json({ ok: true, data: await listJobs(service, body, from, to, page) })
  if (action === 'get-job') return json({ ok: true, data: await getJob(service, body) })
  if (action === 'retry-job') return json({ ok: true, data: await retryJob(service, user.id, body) })
  if (action === 'list-issues') return json({ ok: true, data: await listIssues(service, body, from, to, page) })
  if (action === 'get-issue') return json({ ok: true, data: await getIssue(service, body) })
  if (action === 'update-issue') return json({ ok: true, data: await updateIssue(service, user.id, body) })
  if (action === 'list-settings') {
    const { data, error } = await service.from('application_settings').select('key, value, description, updated_at').order('key')
    if (error) throw error
    return json({ ok: true, data: data || [] })
  }
  if (action === 'update-setting') return json({ ok: true, data: await updateSetting(service, user.id, body) })
  if (action === 'list-audit') return json({ ok: true, data: await listAudit(service, body, from, to, page) })
  if (action === 'health') return json({ ok: true, data: await health(service) })
  if (action === 'ai-usage') return json({ ok: true, data: await aiUsage(service, body, range, from, to, page) })
  if (action === 'profile') return json({ ok: true, data: await adminProfile(service, user, profile) })
  if (action === 'update-profile') return json({ ok: true, data: await updateAdminProfile(service, user.id, body) })

  const unknown = new Error('action')
  unknown.code = 'invalid_action'
  unknown.publicDetail = action ? `Unknown action "${action}".` : 'Missing action.'
  throw unknown
})

function parseRange(body) {
  const now = Date.now()
  const preset = String(body.range || body.period || '30d')
  let start = null
  let end = new Date(now).toISOString()
  if (body.from && body.to) {
    start = new Date(body.from).toISOString()
    end = new Date(body.to).toISOString()
  } else if (preset === '7d') start = new Date(now - 7 * 86400000).toISOString()
  else if (preset === '90d') start = new Date(now - 90 * 86400000).toISOString()
  else if (preset === 'all') start = null
  else start = new Date(now - 30 * 86400000).toISOString()
  return { start, end, preset }
}

function dayKey(value) {
  return String(value || '').slice(0, 10)
}

function fillSeries(startIso, endIso, map) {
  if (!startIso) return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value }))
  const start = new Date(startIso)
  const end = new Date(endIso)
  const rows = []
  for (let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10)
    rows.push({ date: key, ...(map[key] || {}) })
  }
  return rows
}

async function countWhere(service, table, apply) {
  let query = service.from(table).select('id', { count: 'exact', head: true })
  if (apply) query = apply(query)
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

async function sumColumn(service, table, column, apply) {
  let query = service.from(table).select(column).limit(5000)
  if (apply) query = apply(query)
  const { data, error } = await query
  if (error) throw error
  return (data || []).reduce((total, row) => total + (Number(row[column]) || 0), 0)
}

async function writeAudit(service, adminUserId, actionType, resourceType, resourceId, result = 'success', metadata = {}) {
  const { error } = await service.from('admin_audit_logs').insert({
    admin_user_id: adminUserId,
    action_type: actionType,
    resource_type: resourceType,
    resource_id: resourceId ? String(resourceId) : null,
    result,
    metadata,
  })
  if (error) console.log(JSON.stringify({ auditWriteFailed: error.message }))
}

async function overview(service, range) {
  const sinceDay = new Date(Date.now() - 86400000).toISOString()
  const [
    users, activeUsers, deactivatedUsers, recordings, notes, tasks, openIssues,
    queued, processing, completed, failed, failedJobs24h, aiSuccess, aiFailed, inputTokens, outputTokens,
  ] = await Promise.all([
    countWhere(service, 'profiles'),
    countWhere(service, 'profiles', (q) => q.eq('account_status', 'active')),
    countWhere(service, 'profiles', (q) => q.eq('account_status', 'deactivated')),
    countWhere(service, 'audio_files', (q) => q.is('removed_at', null)),
    countWhere(service, 'notes'),
    countWhere(service, 'tasks'),
    countWhere(service, 'reported_issues', (q) => q.eq('status', 'open')),
    countWhere(service, 'processing_jobs', (q) => q.eq('status', 'queued')),
    countWhere(service, 'processing_jobs', (q) => q.eq('status', 'processing')),
    countWhere(service, 'processing_jobs', (q) => q.eq('status', 'completed')),
    countWhere(service, 'processing_jobs', (q) => q.eq('status', 'failed')),
    countWhere(service, 'processing_jobs', (q) => q.eq('status', 'failed').gte('created_at', sinceDay)),
    countWhere(service, 'ai_usage_events', (q) => {
      let next = q.eq('status', 'success')
      if (range.start) next = next.gte('created_at', range.start)
      return next.lte('created_at', range.end)
    }),
    countWhere(service, 'ai_usage_events', (q) => {
      let next = q.eq('status', 'failed')
      if (range.start) next = next.gte('created_at', range.start)
      return next.lte('created_at', range.end)
    }),
    sumColumn(service, 'ai_usage_events', 'input_tokens', (q) => {
      let next = q.eq('status', 'success')
      if (range.start) next = next.gte('created_at', range.start)
      return next.lte('created_at', range.end)
    }),
    sumColumn(service, 'ai_usage_events', 'output_tokens', (q) => {
      let next = q.eq('status', 'success')
      if (range.start) next = next.gte('created_at', range.start)
      return next.lte('created_at', range.end)
    }),
  ])

  const storageBytes = await sumColumn(service, 'audio_files', 'file_size', (q) => q.is('removed_at', null))
  const recent = await recentActivity(service)
  return {
    users,
    activeUsers,
    deactivatedUsers,
    recordings,
    notes,
    tasks,
    openIssues,
    failedJobs24h,
    jobs: { queued, processing, completed, failed, total: queued + processing + completed + failed },
    ai: { success: aiSuccess, failed: aiFailed, inputTokens, outputTokens, period: range.preset },
    storageBytes,
    recent,
    health: await healthSummary(service),
  }
}

async function recentActivity(service) {
  const [profiles, jobs, issues, audits] = await Promise.all([
    service.from('profiles').select('id, full_name, email, created_at, account_status').order('created_at', { ascending: false }).limit(8),
    service.from('processing_jobs').select('id, status, error_code, created_at, completed_at').order('created_at', { ascending: false }).limit(8),
    service.from('reported_issues').select('id, subject, status, created_at, updated_at').order('updated_at', { ascending: false }).limit(8),
    service.from('admin_audit_logs').select('id, action_type, resource_type, resource_id, result, created_at').order('created_at', { ascending: false }).limit(8),
  ])
  const events = []
  for (const row of profiles.data || []) {
    events.push({
      id: `user-${row.id}`,
      type: 'registration',
      label: `Account registered: ${row.email || row.full_name}`,
      at: row.created_at,
      status: row.account_status,
    })
  }
  for (const row of jobs.data || []) {
    events.push({
      id: `job-${row.id}`,
      type: row.status === 'failed' ? 'job_failed' : 'job',
      label: `Job ${row.status}${row.error_code ? ` (${row.error_code})` : ''}`,
      at: row.completed_at || row.created_at,
      status: row.status,
    })
  }
  for (const row of issues.data || []) {
    events.push({
      id: `issue-${row.id}`,
      type: 'issue',
      label: `Issue ${row.status}: ${row.subject}`,
      at: row.updated_at || row.created_at,
      status: row.status,
    })
  }
  for (const row of audits.data || []) {
    events.push({
      id: `audit-${row.id}`,
      type: 'audit',
      label: `${row.action_type} on ${row.resource_type}`,
      at: row.created_at,
      status: row.result,
    })
  }
  return events.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 20)
}

async function analytics(service, range) {
  let profileQuery = service.from('profiles').select('created_at').order('created_at', { ascending: true }).limit(5000)
  let jobQuery = service.from('processing_jobs').select('created_at, status, completed_at').order('created_at', { ascending: true }).limit(5000)
  let usageQuery = service.from('ai_usage_events').select('created_at, status, input_tokens, output_tokens, operation, error_code').order('created_at', { ascending: true }).limit(5000)
  let issueQuery = service.from('reported_issues').select('created_at, status, updated_at').order('created_at', { ascending: true }).limit(5000)
  let audioQuery = service.from('audio_files').select('created_at, file_size, removed_at').order('created_at', { ascending: true }).limit(5000)
  if (range.start) {
    profileQuery = profileQuery.gte('created_at', range.start)
    jobQuery = jobQuery.gte('created_at', range.start)
    usageQuery = usageQuery.gte('created_at', range.start)
    issueQuery = issueQuery.gte('created_at', range.start)
    audioQuery = audioQuery.gte('created_at', range.start)
  }
  profileQuery = profileQuery.lte('created_at', range.end)
  jobQuery = jobQuery.lte('created_at', range.end)
  usageQuery = usageQuery.lte('created_at', range.end)
  issueQuery = issueQuery.lte('created_at', range.end)
  audioQuery = audioQuery.lte('created_at', range.end)

  const [profiles, jobs, usage, issues, audio] = await Promise.all([profileQuery, jobQuery, usageQuery, issueQuery, audioQuery])
  if (profiles.error) throw profiles.error
  if (jobs.error) throw jobs.error
  if (usage.error) throw usage.error
  if (issues.error) throw issues.error
  if (audio.error) throw audio.error

  const registrations = {}
  for (const row of profiles.data || []) {
    const key = dayKey(row.created_at)
    registrations[key] = { count: (registrations[key]?.count || 0) + 1 }
  }
  const processing = {}
  for (const row of jobs.data || []) {
    const key = dayKey(row.created_at)
    const current = processing[key] || { total: 0, completed: 0, failed: 0 }
    current.total += 1
    if (row.status === 'completed') current.completed += 1
    if (row.status === 'failed') current.failed += 1
    processing[key] = current
  }
  const tokens = {}
  for (const row of usage.data || []) {
    const key = dayKey(row.created_at)
    const current = tokens[key] || { input: 0, output: 0, success: 0, failed: 0 }
    current.input += Number(row.input_tokens) || 0
    current.output += Number(row.output_tokens) || 0
    if (row.status === 'success') current.success += 1
    else current.failed += 1
    tokens[key] = current
  }
  const issueTrend = {}
  for (const row of issues.data || []) {
    const key = dayKey(row.created_at)
    const current = issueTrend[key] || { open: 0, resolved: 0 }
    if (row.status === 'resolved' || row.status === 'dismissed') current.resolved += 1
    else current.open += 1
    issueTrend[key] = current
  }
  const storage = {}
  for (const row of audio.data || []) {
    if (row.removed_at) continue
    const key = dayKey(row.created_at)
    storage[key] = { bytes: (storage[key]?.bytes || 0) + (Number(row.file_size) || 0) }
  }

  return {
    period: range,
    registrations: fillSeries(range.start, range.end, registrations).map((row) => ({ date: row.date, count: row.count || 0 })),
    processing: fillSeries(range.start, range.end, processing).map((row) => ({
      date: row.date,
      total: row.total || 0,
      completed: row.completed || 0,
      failed: row.failed || 0,
    })),
    tokens: fillSeries(range.start, range.end, tokens).map((row) => ({
      date: row.date,
      input: row.input || 0,
      output: row.output || 0,
      success: row.success || 0,
      failed: row.failed || 0,
    })),
    issues: fillSeries(range.start, range.end, issueTrend).map((row) => ({
      date: row.date,
      open: row.open || 0,
      resolved: row.resolved || 0,
    })),
    storage: fillSeries(range.start, range.end, storage).map((row) => ({ date: row.date, bytes: row.bytes || 0 })),
    estimatedCostLabel: 'Estimated from recorded token counts only. Provider billing APIs are not queried.',
  }
}

function cleanQuery(value) {
  return String(value || '').replace(/[%_,]/g, ' ').trim()
}

async function listUsers(service, body, from, to, page) {
  let query = service.from('profiles').select('id, full_name, email, role, account_status, created_at, updated_at', { count: 'exact' })
  const term = cleanQuery(body.query)
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
  if (body.status === 'active' || body.status === 'deactivated') query = query.eq('account_status', body.status)
  const sort = body.sort === 'name' ? 'full_name' : 'created_at'
  const ascending = body.sortDir === 'asc'
  const { data, error, count } = await query.order(sort, { ascending }).range(from, to)
  if (error) throw error
  const rows = await Promise.all((data || []).map(async (user) => {
    const [recordings, notes, tasks, authUser] = await Promise.all([
      countWhere(service, 'audio_files', (q) => q.eq('user_id', user.id).is('removed_at', null)),
      countWhere(service, 'notes', (q) => q.eq('user_id', user.id)),
      countWhere(service, 'tasks', (q) => q.eq('user_id', user.id)),
      service.auth.admin.getUserById(user.id),
    ])
    return {
      ...user,
      recordings,
      notes,
      tasks,
      lastSignInAt: authUser.data?.user?.last_sign_in_at || null,
    }
  }))
  return { rows, count: count || 0, page, pageSize: PAGE_SIZE }
}

async function getUser(service, body) {
  const { data: user, error } = await service.from('profiles').select('id, full_name, email, role, account_status, created_at, updated_at').eq('id', body.userId).maybeSingle()
  if (error) throw error
  if (!user) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  const [recordings, notes, tasks, jobs, authUser] = await Promise.all([
    countWhere(service, 'audio_files', (q) => q.eq('user_id', user.id).is('removed_at', null)),
    countWhere(service, 'notes', (q) => q.eq('user_id', user.id)),
    countWhere(service, 'tasks', (q) => q.eq('user_id', user.id)),
    countWhere(service, 'processing_jobs', (q) => q.eq('user_id', user.id)),
    service.auth.admin.getUserById(user.id),
  ])
  return {
    ...user,
    recordings,
    notes,
    tasks,
    jobs,
    lastSignInAt: authUser.data?.user?.last_sign_in_at || null,
    emailConfirmedAt: authUser.data?.user?.email_confirmed_at || null,
  }
}

async function setStatus(service, actorId, body) {
  if (!['active', 'deactivated'].includes(body.accountStatus)) {
    const error = new Error('status')
    error.code = 'invalid_json'
    throw error
  }
  if (body.userId === actorId && body.accountStatus === 'deactivated') {
    const error = new Error('self')
    error.code = 'forbidden'
    throw error
  }
  const { data: existing } = await service.from('profiles').select('id, account_status, role').eq('id', body.userId).maybeSingle()
  if (!existing) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  const { error } = await service.from('profiles').update({ account_status: body.accountStatus }).eq('id', body.userId)
  if (error) throw error
  const ban = await service.auth.admin.updateUserById(body.userId, {
    ban_duration: body.accountStatus === 'deactivated' ? '876000h' : 'none',
  })
  if (ban.error) {
    await service.from('profiles').update({ account_status: existing.account_status }).eq('id', body.userId)
    await writeAudit(service, actorId, body.accountStatus === 'deactivated' ? 'deactivate_user' : 'activate_user', 'profile', body.userId, 'failed', { reason: 'ban_update_failed' })
    const failure = new Error('ban')
    failure.code = 'processing_failed'
    throw failure
  }
  await writeAudit(service, actorId, body.accountStatus === 'deactivated' ? 'deactivate_user' : 'activate_user', 'profile', body.userId, 'success', {
    previous: existing.account_status,
    next: body.accountStatus,
  })
  return { userId: body.userId, accountStatus: body.accountStatus }
}

async function setRole(service, actorId, body) {
  if (!['user', 'admin'].includes(body.role)) {
    const error = new Error('role')
    error.code = 'invalid_json'
    throw error
  }
  if (body.userId === actorId && body.role !== 'admin') {
    const error = new Error('self')
    error.code = 'forbidden'
    error.publicDetail = 'You cannot remove your own administrator role.'
    throw error
  }
  const { data: existing } = await service.from('profiles').select('id, role').eq('id', body.userId).maybeSingle()
  if (!existing) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  if (existing.role === body.role) return { userId: body.userId, role: body.role }
  const { error } = await service.from('profiles').update({ role: body.role }).eq('id', body.userId)
  if (error) throw error
  await writeAudit(service, actorId, body.role === 'admin' ? 'promote_admin' : 'demote_admin', 'profile', body.userId, 'success', {
    previous: existing.role,
    next: body.role,
  })
  return { userId: body.userId, role: body.role }
}

async function listJobs(service, body, from, to, page) {
  let query = service.from('processing_jobs').select('id, user_id, audio_file_id, status, current_stage, error_code, error_message, retry_count, created_at, updated_at, completed_at, locked_at, audio_files(file_name, mime_type, file_size), profiles(email, full_name)', { count: 'exact' })
  if (JOB_STATUSES.includes(body.status)) query = query.eq('status', body.status)
  const term = cleanQuery(body.query)
  if (term) {
    if (/^[0-9a-f-]{8,}$/i.test(term)) query = query.or(`id.eq.${term},user_id.eq.${term}`)
  }
  if (body.from) query = query.gte('created_at', new Date(body.from).toISOString())
  if (body.to) query = query.lte('created_at', new Date(body.to).toISOString())
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error
  const now = Date.now()
  const rows = (data || []).map((job) => {
    const started = new Date(job.created_at).getTime()
    const ended = job.completed_at ? new Date(job.completed_at).getTime() : now
    const durationMs = Number.isFinite(started) ? Math.max(0, ended - started) : null
    const stale = job.status === 'processing' && job.locked_at && (now - new Date(job.locked_at).getTime() > 10 * 60 * 1000)
    return {
      ...job,
      fileName: job.audio_files?.file_name || null,
      durationMs,
      overdue: Boolean(stale) || (job.status === 'queued' && now - started > 15 * 60 * 1000),
    }
  })
  return { rows, count: count || 0, page, pageSize: PAGE_SIZE }
}

async function getJob(service, body) {
  const { data, error } = await service
    .from('processing_jobs')
    .select('id, user_id, audio_file_id, note_id, status, current_stage, error_code, error_message, retry_count, created_at, updated_at, completed_at, locked_at, audio_files(file_name, mime_type, file_size, created_at), profiles(email, full_name)')
    .eq('id', body.jobId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  const started = new Date(data.created_at).getTime()
  const ended = data.completed_at ? new Date(data.completed_at).getTime() : Date.now()
  return {
    ...data,
    fileName: data.audio_files?.file_name || null,
    durationMs: Number.isFinite(started) ? Math.max(0, ended - started) : null,
  }
}

async function retryJob(service, adminId, body) {
  const { data: job, error } = await service
    .from('processing_jobs')
    .select('id, user_id, audio_file_id, status, retry_count')
    .eq('id', body.jobId)
    .maybeSingle()
  if (error) throw error
  if (!job) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  if (job.status !== 'failed') {
    const bad = new Error('status')
    bad.code = 'invalid_json'
    bad.publicDetail = 'Only failed jobs can be retried.'
    throw bad
  }
  const { count: activeCount, error: activeError } = await service
    .from('processing_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('audio_file_id', job.audio_file_id)
    .in('status', ['queued', 'processing'])
  if (activeError) throw activeError
  if ((activeCount || 0) > 0) {
    const busy = new Error('busy')
    busy.code = 'retry_in_progress'
    throw busy
  }
  const { data: created, error: insertError } = await service.from('processing_jobs').insert({
    user_id: job.user_id,
    audio_file_id: job.audio_file_id,
    status: 'queued',
    current_stage: 'preparing',
    retry_count: 0,
  }).select('id, status, created_at').single()
  if (insertError) throw insertError
  await writeAudit(service, adminId, 'retry_job', 'processing_job', job.id, 'success', { newJobId: created.id })
  return { previousJobId: job.id, jobId: created.id, status: created.status }
}

async function listIssues(service, body, from, to, page) {
  let query = service.from('reported_issues').select('id, user_id, subject, description, status, admin_notes, created_at, updated_at, profiles(email, full_name)', { count: 'exact' })
  if (ISSUE_STATUSES.includes(body.status)) query = query.eq('status', body.status)
  const term = cleanQuery(body.query)
  if (term) query = query.or(`subject.ilike.%${term}%,description.ilike.%${term}%`)
  if (body.from) query = query.gte('created_at', new Date(body.from).toISOString())
  if (body.to) query = query.lte('created_at', new Date(body.to).toISOString())
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) {
    if (/admin_notes/.test(error.message || '')) {
      let fallback = service.from('reported_issues').select('id, user_id, subject, description, status, created_at, updated_at, profiles(email, full_name)', { count: 'exact' })
      if (ISSUE_STATUSES.includes(body.status)) fallback = fallback.eq('status', body.status)
      if (term) fallback = fallback.or(`subject.ilike.%${term}%,description.ilike.%${term}%`)
      const again = await fallback.order('created_at', { ascending: false }).range(from, to)
      if (again.error) throw again.error
      return { rows: (again.data || []).map((row) => ({ ...row, admin_notes: '' })), count: again.count || 0, page, pageSize: PAGE_SIZE }
    }
    throw error
  }
  return { rows: data || [], count: count || 0, page, pageSize: PAGE_SIZE }
}

async function getIssue(service, body) {
  const { data, error } = await service
    .from('reported_issues')
    .select('id, user_id, subject, description, status, admin_notes, created_at, updated_at, profiles(email, full_name)')
    .eq('id', body.issueId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  return data
}

async function updateIssue(service, adminId, body) {
  if (!ISSUE_STATUSES.includes(body.status)) {
    const error = new Error('status')
    error.code = 'invalid_json'
    throw error
  }
  const patch = { status: body.status }
  if (typeof body.adminNotes === 'string') patch.admin_notes = body.adminNotes.slice(0, 4000)
  const { data, error } = await service.from('reported_issues').update(patch).eq('id', body.issueId).select('id, status, admin_notes, updated_at').maybeSingle()
  if (error) throw error
  if (!data) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  await writeAudit(service, adminId, 'update_issue', 'reported_issue', body.issueId, 'success', { status: body.status })
  return data
}

async function updateSetting(service, adminId, body) {
  const rule = SETTING_RULES[body.key]
  if (!rule || !rule(body.value)) {
    const error = new Error('setting')
    error.code = 'invalid_setting'
    throw error
  }
  const { error } = await service.from('application_settings').update({ value: body.value }).eq('key', body.key)
  if (error) throw error
  await writeAudit(service, adminId, 'update_setting', 'application_setting', body.key, 'success', {})
  return { key: body.key }
}

async function listAudit(service, body, from, to, page) {
  let query = service.from('admin_audit_logs').select('id, admin_user_id, action_type, resource_type, resource_id, result, metadata, created_at, profiles:admin_user_id(email, full_name)', { count: 'exact' })
  const term = cleanQuery(body.query)
  if (term) query = query.or(`action_type.ilike.%${term}%,resource_type.ilike.%${term}%,resource_id.ilike.%${term}%`)
  if (body.from) query = query.gte('created_at', new Date(body.from).toISOString())
  if (body.to) query = query.lte('created_at', new Date(body.to).toISOString())
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) {
    if (/admin_audit_logs|relation/.test(error.message || '')) {
      return { rows: [], count: 0, page, pageSize: PAGE_SIZE, setupRequired: true }
    }
    throw error
  }
  return { rows: data || [], count: count || 0, page, pageSize: PAGE_SIZE }
}

async function healthSummary(service) {
  const readEnv = (name) => Deno.env.get(name)
  const stt = resolveProvider('stt', readEnv)
  const llm = resolveProvider('llm', readEnv)
  return {
    database: 'ok',
    speechToTextConfigured: stt.configured,
    languageModelConfigured: llm.configured,
    sttProvider: stt.supported ? `${stt.provider} (${stt.model})` : `${stt.provider} (unsupported)`,
    llmProvider: llm.supported ? `${llm.provider} (${llm.model})` : `${llm.provider} (unsupported)`,
  }
}

async function health(service) {
  const checkedAt = new Date().toISOString()
  const summary = await healthSummary(service)
  let authStatus = 'ok'
  let storageStatus = 'unknown'
  let storageDetail = 'Bucket listing was not confirmed.'
  try {
    const { error } = await service.from('profiles').select('id', { count: 'exact', head: true }).limit(1)
    if (error) throw error
  } catch (error) {
    summary.database = 'error'
    summary.databaseDetail = String(error.message || 'Database query failed').slice(0, 160)
  }
  try {
    const probe = await service.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (probe.error) throw probe.error
  } catch (error) {
    authStatus = 'error'
    summary.authDetail = String(error.message || 'Auth admin API failed').slice(0, 160)
  }
  try {
    const { data, error } = await service.storage.getBucket('voice-recordings')
    if (error) throw error
    storageStatus = data ? 'ok' : 'missing'
    storageDetail = data ? 'Private bucket voice-recordings is available.' : 'Bucket missing.'
  } catch (error) {
    storageStatus = 'error'
    storageDetail = String(error.message || 'Storage check failed').slice(0, 160)
  }
  const sinceDay = new Date(Date.now() - 86400000).toISOString()
  const recentFailures = await countWhere(service, 'processing_jobs', (q) => q.eq('status', 'failed').gte('created_at', sinceDay))
  const storageBytes = await sumColumn(service, 'audio_files', 'file_size', (q) => q.is('removed_at', null))
  return {
    checkedAt,
    services: [
      { name: 'Supabase Auth', status: authStatus, detail: summary.authDetail || 'Admin auth API responded.' },
      { name: 'PostgreSQL', status: summary.database === 'ok' ? 'ok' : 'error', detail: summary.databaseDetail || 'Profiles query succeeded.' },
      { name: 'Supabase Storage', status: storageStatus, detail: storageDetail },
      { name: 'Speech-to-text provider', status: summary.speechToTextConfigured ? 'ok' : 'unconfigured', detail: summary.sttProvider },
      { name: 'Language-model provider', status: summary.languageModelConfigured ? 'ok' : 'unconfigured', detail: summary.llmProvider },
      { name: 'Edge Functions', status: 'ok', detail: 'admin-operations is responding to this health check.' },
    ],
    recentFailures,
    storageBytes,
  }
}

async function aiUsage(service, body, range, from, to, page) {
  let query = service.from('ai_usage_events').select('id, user_id, job_id, operation, provider, model, status, input_tokens, output_tokens, audio_seconds, error_code, created_at', { count: 'exact' })
  if (range.start) query = query.gte('created_at', range.start)
  query = query.lte('created_at', range.end)
  if (body.provider) query = query.eq('provider', body.provider)
  if (body.operation) query = query.eq('operation', body.operation)
  if (body.status === 'success' || body.status === 'failed') query = query.eq('status', body.status)
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error

  let totalsQuery = service.from('ai_usage_events').select('status, operation, input_tokens, output_tokens, audio_seconds, error_code').limit(5000)
  if (range.start) totalsQuery = totalsQuery.gte('created_at', range.start)
  totalsQuery = totalsQuery.lte('created_at', range.end)
  if (body.provider) totalsQuery = totalsQuery.eq('provider', body.provider)
  if (body.operation) totalsQuery = totalsQuery.eq('operation', body.operation)
  const totals = await totalsQuery
  if (totals.error) throw totals.error
  const rows = totals.data || []
  const summary = {
    transcriptionRequests: rows.filter((row) => row.operation === 'transcribe').length,
    transcriptionSuccess: rows.filter((row) => row.operation === 'transcribe' && row.status === 'success').length,
    transcriptionFailed: rows.filter((row) => row.operation === 'transcribe' && row.status === 'failed').length,
    languageModelRequests: rows.filter((row) => row.operation === 'generate_notes' || row.operation === 'chat').length,
    inputTokens: rows.reduce((sum, row) => sum + (Number(row.input_tokens) || 0), 0),
    outputTokens: rows.reduce((sum, row) => sum + (Number(row.output_tokens) || 0), 0),
    audioSeconds: rows.reduce((sum, row) => sum + (Number(row.audio_seconds) || 0), 0),
    rateLimitErrors: rows.filter((row) => row.error_code === 'rate_limited').length,
    providerErrors: rows.filter((row) => row.status === 'failed').length,
    source: 'Recorded from Edge Function usage events. Not a live provider billing feed.',
  }
  return { summary, rows: data || [], count: count || 0, page, pageSize: PAGE_SIZE, period: range }
}

async function adminProfile(service, user, profile) {
  const authUser = await service.auth.admin.getUserById(user.id)
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    createdAt: authUser.data?.user?.created_at || null,
    lastSignInAt: authUser.data?.user?.last_sign_in_at || null,
  }
}

async function updateAdminProfile(service, adminId, body) {
  const name = String(body.fullName || '').trim()
  if (name.length < 2 || name.length > 80) {
    const error = new Error('name')
    error.code = 'invalid_json'
    throw error
  }
  const { error } = await service.from('profiles').update({ full_name: name }).eq('id', adminId)
  if (error) throw error
  await writeAudit(service, adminId, 'update_profile', 'profile', adminId, 'success', {})
  return { fullName: name }
}
