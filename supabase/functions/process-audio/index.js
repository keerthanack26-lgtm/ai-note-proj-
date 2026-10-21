import { generateNotes, providerName, transcribeAudio } from '../_shared/ai.js'
import { requireUser } from '../_shared/auth.js'
import { json, publicError, readBody, servePost } from '../_shared/http.js'
import { assertWithinRateLimit, recordUsage } from '../_shared/usage.js'
import { groundExtractions, validateAiNotes } from '../_shared/validateNotes.js'

servePost(async (req) => {
  const { user, service } = await requireUser(req)
  const body = await readBody(req)
  if (body.regenerate) return regenerate(service, user, body.noteId)
  return runJob(service, user, body)
})

async function runJob(service, user, body) {
  const { data: job, error } = await service.from('processing_jobs').select('*').eq('id', body.jobId).eq('user_id', user.id).maybeSingle()
  if (error || !job) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  if (job.status === 'completed') return json({ ok: true, data: { done: true, noteId: job.note_id, stage: 'completed' } })
  if (job.status === 'failed' && !body.retry) {
    return json({ ok: true, data: { done: false, failed: true, stage: job.current_stage, error: job.error_message } })
  }
  if (body.retry) {
    if (job.retry_count >= 50) {
      const exhausted = new Error('retry')
      exhausted.code = 'retry_exhausted'
      throw exhausted
    }
    await service.from('processing_jobs').update({
      status: 'queued',
      error_code: null,
      error_message: null,
      locked_at: null,
      retry_count: job.retry_count + 1,
    }).eq('id', job.id)
  }

  const { data: claimedRow, error: claimError } = await service.rpc('claim_processing_job', { target_id: job.id, owner_id: user.id })
  if (claimError) {
    const claimFailed = new Error('claim')
    claimFailed.code = 'processing_failed'
    claimFailed.publicDetail = claimError.message || 'The processing job could not be claimed.'
    throw claimFailed
  }
  const claimed = Array.isArray(claimedRow) ? claimedRow[0] : claimedRow
  if (!claimed) return json({ ok: true, data: { inProgress: true, stage: job.current_stage } })

  try {
    await assertWithinRateLimit(service, user.id)
    const { data: audio } = await service.from('audio_files').select('*').eq('id', job.audio_file_id).eq('user_id', user.id).maybeSingle()
    if (!audio || audio.removed_at) {
      const missingAudio = new Error('audio')
      missingAudio.code = 'missing_audio'
      throw missingAudio
    }
    let note = await loadNote(service, user.id, claimed.note_id, audio.id)
    if (!note?.transcript?.trim()) {
      await setStage(service, job.id, 'transcribing')
      const transcript = await transcribe(service, user.id, job.id, audio)
      note = await saveTranscript(service, user.id, note, audio, transcript)
      await service.from('processing_jobs').update({
        status: 'queued',
        current_stage: 'generating_notes',
        note_id: note.id,
        locked_at: null,
      }).eq('id', job.id)
      return json({ ok: true, data: { continue: true, stage: 'generating_notes', noteId: note.id } })
    }

    await setStage(service, job.id, 'generating_notes')
    const { data: prefs } = await service.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle()
    const generated = await generateValidated(service, user.id, job.id, note.transcript, prefs?.summary_style)
    await setStage(service, job.id, 'extracting_actions')
    await service.from('notes').update({
      title: note.title && note.title !== 'Untitled note' ? note.title : generated.title,
      short_summary: generated.short_summary,
      detailed_summary: generated.truncated
        ? `Only the first portion of a long transcript was sent to the model.\n\n${generated.detailed_summary}`
        : generated.detailed_summary,
      key_points: generated.key_points,
      decisions: generated.decisions,
      action_items: generated.action_items,
      deadlines: generated.deadlines,
      language: generated.language || note.language,
      processing_status: 'completed',
    }).eq('id', note.id)
    if (prefs?.auto_create_tasks) await insertTasks(service, user.id, note.id, generated.action_items)
    await setStage(service, job.id, 'saving')
    if (prefs && prefs.retain_audio === false) {
      await service.storage.from('voice-recordings').remove([audio.storage_path])
      await service.from('audio_files').update({ removed_at: new Date().toISOString() }).eq('id', audio.id)
    }
    await service.from('processing_jobs').update({
      status: 'completed',
      current_stage: 'completed',
      note_id: note.id,
      locked_at: null,
      error_code: null,
      error_message: null,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id)
    return json({ ok: true, data: { done: true, noteId: note.id, stage: 'completed' } })
  } catch (error) {
    const mapped = publicError(error)
    await service.from('processing_jobs').update({
      status: 'failed',
      error_code: mapped.code,
      error_message: mapped.message,
      locked_at: null,
    }).eq('id', job.id)
    throw error
  }
}

async function regenerate(service, user, noteId) {
  const { data: note } = await service.from('notes').select('*').eq('id', noteId).eq('user_id', user.id).maybeSingle()
  if (!note) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  if (!note.transcript?.trim()) {
    const empty = new Error('empty')
    empty.code = 'empty_transcript'
    throw empty
  }
  await assertWithinRateLimit(service, user.id)
  await service.from('notes').update({ processing_status: 'processing' }).eq('id', note.id)
  try {
    const { data: prefs } = await service.from('user_preferences').select('summary_style').eq('user_id', user.id).maybeSingle()
    const generated = await generateValidated(service, user.id, null, note.transcript, prefs?.summary_style)
    await service.from('notes').update({
      short_summary: generated.short_summary,
      detailed_summary: generated.detailed_summary,
      key_points: generated.key_points,
      decisions: generated.decisions,
      action_items: generated.action_items,
      deadlines: generated.deadlines,
      language: generated.language || note.language,
      processing_status: 'completed',
    }).eq('id', note.id)
    return json({ ok: true, data: { done: true, noteId: note.id } })
  } catch (error) {
    await service.from('notes').update({ processing_status: 'failed' }).eq('id', note.id)
    throw error
  }
}

async function loadNote(service, userId, noteId, audioId) {
  if (noteId) {
    const { data } = await service.from('notes').select('*').eq('id', noteId).eq('user_id', userId).maybeSingle()
    if (data) return data
  }
  const { data } = await service.from('notes').select('*').eq('audio_file_id', audioId).eq('user_id', userId).maybeSingle()
  return data
}

async function transcribe(service, userId, jobId, audio) {
  const { data: file, error } = await service.storage.from('voice-recordings').download(audio.storage_path)
  if (error || !file) {
    const missing = new Error('audio')
    missing.code = 'missing_audio'
    throw missing
  }
  const { data: prefs } = await service.from('user_preferences').select('preferred_language').eq('user_id', userId).maybeSingle()
  try {
    const result = await transcribeAudio({
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: audio.mime_type,
      fileName: audio.file_name,
      language: prefs?.preferred_language || '',
    })
    if (!result.text) {
      const empty = new Error('empty')
      empty.code = 'empty_transcript'
      throw empty
    }
    await recordUsage(service, {
      user_id: userId,
      job_id: jobId,
      operation: 'transcribe',
      provider: result.provider,
      model: result.model,
      status: 'success',
      audio_seconds: result.duration,
    })
    if (!audio.duration_seconds && result.duration) {
      await service.from('audio_files').update({ duration_seconds: result.duration }).eq('id', audio.id)
    }
    return result
  } catch (error) {
    await recordUsage(service, {
      user_id: userId,
      job_id: jobId,
      operation: 'transcribe',
      provider: providerName('stt'),
      status: 'failed',
      error_code: error.code || 'processing_failed',
    })
    throw error
  }
}

async function saveTranscript(service, userId, existing, audio, transcript) {
  const payload = {
    user_id: userId,
    audio_file_id: audio.id,
    transcript: transcript.text,
    segments: transcript.segments,
    language: transcript.language,
    speaker_labels_supported: false,
    processing_status: 'processing',
    title: existing?.title || 'Untitled note',
  }
  if (existing?.id) {
    const { data, error } = await service.from('notes').update(payload).eq('id', existing.id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await service.from('notes').insert(payload).select().single()
  if (error) throw error
  return data
}

async function generateValidated(service, userId, jobId, transcript, style) {
  let errors = []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateNotes({ transcript, style, errors })
      const validated = validateAiNotes(result.parsed)
      if (!validated.ok) {
        errors = validated.errors
        continue
      }
      await recordUsage(service, {
        user_id: userId,
        job_id: jobId,
        operation: 'generate_notes',
        provider: result.provider,
        model: result.model,
        status: 'success',
        input_tokens: result.usage?.prompt_tokens || null,
        output_tokens: result.usage?.completion_tokens || null,
      })
      return { ...groundExtractions(validated.value, transcript), truncated: result.truncated }
    } catch (error) {
      if (error.code === 'invalid_ai_json' && attempt === 0) {
        errors = ['Response was not valid JSON']
        continue
      }
      await recordUsage(service, {
        user_id: userId,
        job_id: jobId,
        operation: 'generate_notes',
        provider: providerName('llm'),
        status: 'failed',
        error_code: error.code || 'processing_failed',
      })
      throw error
    }
  }
  await recordUsage(service, {
    user_id: userId,
    job_id: jobId,
    operation: 'generate_notes',
    provider: providerName('llm'),
    status: 'failed',
    error_code: 'invalid_ai_json',
  })
  const invalid = new Error('schema')
  invalid.code = 'invalid_ai_json'
  throw invalid
}

async function insertTasks(service, userId, noteId, items) {
  const rows = (items || []).filter((item) => item.title).map((item) => ({
    user_id: userId,
    note_id: noteId,
    title: item.title,
    description: item.description || '',
    priority: item.priority || 'medium',
    status: 'pending',
    due_date: item.confidence === 'high' ? item.due_date : null,
    confidence: item.confidence || 'low',
  }))
  if (rows.length) await service.from('tasks').insert(rows)
}

async function setStage(service, jobId, stage) {
  await service.from('processing_jobs').update({ current_stage: stage, status: 'processing' }).eq('id', jobId)
}
