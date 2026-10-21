import { supabase } from '../lib/supabase'
import { PAGE_SIZE, geminiPreferenceLanguage } from '../utils/constants'

function client() {
  if (!supabase) throw new Error('Supabase is not configured in this browser app.')
  return supabase
}

async function currentUser() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new Error('Your session has expired. Log in again.')
  return data.user
}

function escapeIlike(value) {
  return String(value || '').replace(/[%_,]/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function getDashboard(userId) {
  const db = client()
  const today = new Date().toISOString().slice(0, 10)
  const upcomingEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const [recordings, notes, tasks, pending, completed, recentAudio, recentNotes, deadlines] = await Promise.all([
    db.from('audio_files').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('removed_at', null),
    db.from('notes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending'),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'completed'),
    db.from('audio_files').select('id, file_name, created_at, duration_seconds, source').eq('user_id', userId).is('removed_at', null).order('created_at', { ascending: false }).limit(5),
    db.from('notes').select('id, title, short_summary, created_at, category, processing_status').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    db.from('tasks').select('id, title, due_date, status, priority').eq('user_id', userId).neq('status', 'completed').not('due_date', 'is', null).lte('due_date', upcomingEnd).order('due_date', { ascending: true }).limit(5),
  ])
  const firstError = [recordings, notes, tasks, pending, completed, recentAudio, recentNotes, deadlines].find((result) => result.error)
  if (firstError) throw firstError.error
  return {
    recordings: recordings.count || 0,
    notes: notes.count || 0,
    tasks: tasks.count || 0,
    pending: pending.count || 0,
    completed: completed.count || 0,
    recentAudio: recentAudio.data || [],
    recentNotes: recentNotes.data || [],
    deadlines: (deadlines.data || []).map((task) => ({ ...task, overdue: task.due_date < today })),
  }
}

export async function listNotes(filters) {
  const page = filters.page || 1
  const pageSize = filters.pageSize || PAGE_SIZE
  let query = client().from('notes').select('*', { count: 'exact' })
  const search = escapeIlike(filters.search)
  if (search) query = query.or(`title.ilike.%${search}%,transcript.ilike.%${search}%,short_summary.ilike.%${search}%`)
  if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category)
  if (filters.status && filters.status !== 'all') query = query.eq('processing_status', filters.status)
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00`)
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`)
  if (filters.sort === 'oldest') query = query.order('created_at', { ascending: true })
  else if (filters.sort === 'title') query = query.order('title', { ascending: true })
  else query = query.order('created_at', { ascending: false })
  const from = (page - 1) * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw error
  return { rows: data || [], count: count || 0, page, pageSize }
}

export async function getNote(id) {
  const { data, error } = await client().from('notes').select('*, audio_files(id, file_name, storage_path, mime_type, duration_seconds, removed_at)').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createManualNote() {
  const user = await currentUser()
  const { data, error } = await client()
    .from('notes')
    .insert({
      user_id: user.id,
      title: 'Untitled note',
      transcript: '',
      category: 'general',
      processing_status: 'draft',
      speaker_labels_supported: false,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

const NOTE_FIELDS = ['title', 'transcript', 'short_summary', 'detailed_summary', 'key_points', 'decisions', 'action_items', 'deadlines', 'language', 'category', 'processing_status']

export async function updateNote(id, patch) {
  const next = {}
  NOTE_FIELDS.forEach((key) => {
    if (patch[key] !== undefined) next[key] = patch[key]
  })
  const { data, error } = await client().from('notes').update(next).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteNote(id) {
  const { error } = await client().from('notes').delete().eq('id', id)
  if (error) throw error
}

export async function listTasks(filters = {}) {
  let query = client().from('tasks').select('*, notes(id, title)', { count: 'exact' })
  const search = escapeIlike(filters.search)
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.priority && filters.priority !== 'all') query = query.eq('priority', filters.priority)
  if (filters.sort === 'due') query = query.order('due_date', { ascending: true, nullsFirst: false })
  else if (filters.sort === 'priority') query = query.order('priority', { ascending: true })
  else query = query.order('created_at', { ascending: false })
  const page = filters.page || 1
  const pageSize = filters.pageSize || 20
  const from = (page - 1) * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw error
  return { rows: data || [], count: count || 0, page, pageSize }
}

export async function createTask(payload) {
  const user = await currentUser()
  const { data, error } = await client()
    .from('tasks')
    .insert({
      user_id: user.id,
      note_id: payload.note_id || null,
      title: payload.title,
      description: payload.description || '',
      priority: payload.priority || 'medium',
      status: payload.status || 'pending',
      due_date: payload.due_date || null,
      confidence: payload.confidence || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createTasksFromItems(noteId, items) {
  const user = await currentUser()
  const rows = items
    .filter((item) => item?.title)
    .map((item) => ({
      user_id: user.id,
      note_id: noteId,
      title: item.title,
      description: item.description || '',
      priority: ['low', 'medium', 'high'].includes(item.priority) ? item.priority : 'medium',
      status: 'pending',
      due_date: item.confidence === 'high' ? item.due_date || null : null,
      confidence: item.confidence || 'low',
    }))
  if (!rows.length) return []
  const { data, error } = await client().from('tasks').insert(rows).select()
  if (error) throw error
  return data
}

export async function updateTask(id, patch) {
  const next = {}
  ;['title', 'description', 'priority', 'status', 'due_date', 'note_id', 'completed_at'].forEach((key) => {
    if (patch[key] !== undefined) next[key] = patch[key]
  })
  if (patch.status === 'completed' && !patch.completed_at) next.completed_at = new Date().toISOString()
  if (patch.status && patch.status !== 'completed') next.completed_at = null
  const { data, error } = await client().from('tasks').update(next).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteTask(id) {
  const { error } = await client().from('tasks').delete().eq('id', id)
  if (error) throw error
}

export async function listAudioHistory(page = 1) {
  const pageSize = 8
  const from = (page - 1) * pageSize
  const { data, error, count } = await client()
    .from('audio_files')
    .select('*, processing_jobs(id, status, current_stage, error_code, error_message, retry_count, created_at), notes(id, title)', { count: 'exact' })
    .is('removed_at', null)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw error
  return { rows: data || [], count: count || 0, page, pageSize }
}

export async function deleteRecording(audio, { deleteNote = true } = {}) {
  const user = await currentUser()
  const db = client()
  if (audio?.storage_path && !audio.removed_at) {
    await db.storage.from('voice-recordings').remove([audio.storage_path]).catch(() => {})
  }
  if (deleteNote) {
    const { error: noteError } = await db.from('notes').delete().eq('audio_file_id', audio.id).eq('user_id', user.id)
    if (noteError) throw noteError
  } else {
    await db.from('notes').update({ audio_file_id: null }).eq('audio_file_id', audio.id).eq('user_id', user.id)
  }
  const { error } = await db
    .from('audio_files')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', audio.id)
    .eq('user_id', user.id)
  if (error) throw error
}

export async function ensureTranscribeLanguage() {
  const user = await currentUser()
  const db = client()
  const { data, error } = await db.from('user_preferences').select('preferred_language').eq('user_id', user.id).maybeSingle()
  if (error) throw error
  const next = geminiPreferenceLanguage(data?.preferred_language)
  if (!data || data.preferred_language === next) return next
  const { error: updateError } = await db.from('user_preferences').update({ preferred_language: next }).eq('user_id', user.id)
  if (updateError) throw updateError
  return next
}

export async function createRetryJob(audioFileId) {
  const user = await currentUser()
  const { data, error } = await client()
    .from('processing_jobs')
    .insert({
      user_id: user.id,
      audio_file_id: audioFileId,
      status: 'queued',
      current_stage: 'preparing',
      retry_count: 0,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getJob(id) {
  const { data, error } = await client()
    .from('processing_jobs')
    .select('*, audio_files(id, file_name, duration_seconds, mime_type, storage_path), notes(id, title)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function listChat(noteId) {
  const { data, error } = await client()
    .from('note_chat_messages')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function reportIssue(subject, description) {
  const user = await currentUser()
  const { error } = await client().from('reported_issues').insert({
    user_id: user.id,
    subject,
    description,
    status: 'open',
  })
  if (error) throw error
}

export async function updateProfileName(fullName) {
  const user = await currentUser()
  const { data, error } = await client().from('profiles').update({ full_name: fullName }).eq('id', user.id).select().single()
  if (error) throw error
  return data
}

export async function updatePreferences(patch) {
  const user = await currentUser()
  const { data, error } = await client().from('user_preferences').update(patch).eq('user_id', user.id).select().single()
  if (error) throw error
  return data
}

export async function getUsageSummary(userId) {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const db = client()
  const [notes, audio, usage, settings] = await Promise.all([
    db.from('notes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('audio_files').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('removed_at', null),
    db.from('ai_usage_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', monthStart.toISOString()),
    db.from('application_settings').select('value').eq('key', 'ai_hourly_limit').maybeSingle(),
  ])
  const firstError = [notes, audio, usage, settings].find((result) => result.error)
  if (firstError) throw firstError.error
  return {
    notes: notes.count || 0,
    audio: audio.count || 0,
    aiThisMonth: usage.count || 0,
    hourlyLimit: Number(settings.data?.value ?? 30),
  }
}
