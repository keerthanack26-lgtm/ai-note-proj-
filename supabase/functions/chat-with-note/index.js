import { answerQuestion, providerName } from '../_shared/ai.js'
import { requireUser } from '../_shared/auth.js'
import { json, readBody, servePost } from '../_shared/http.js'
import { assertWithinRateLimit, recordUsage, settingValue } from '../_shared/usage.js'
import { validateChatAnswer } from '../_shared/validateNotes.js'

function hasContent(note) {
  const chunks = [note.transcript, note.short_summary, note.detailed_summary, ...(note.key_points || [])]
  return chunks.some((item) => String(item || '').trim())
}

servePost(async (req) => {
  const { user, service } = await requireUser(req)
  const body = await readBody(req)
  const question = String(body.question || '').trim()
  const limit = Number(await settingValue(service, 'chat_max_input_chars', 2000))
  if (!question) {
    const error = new Error('empty')
    error.code = 'empty_question'
    throw error
  }
  if (question.length > limit) {
    const error = new Error('long')
    error.code = 'payload_too_large'
    throw error
  }
  const { data: note } = await service.from('notes').select('*').eq('id', body.noteId).eq('user_id', user.id).maybeSingle()
  if (!note) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  if (!hasContent(note)) {
    return json({
      ok: true,
      data: {
        answer: 'This note does not contain information to answer that question.',
        grounded: true,
        missingInformation: true,
      },
    })
  }

  await assertWithinRateLimit(service, user.id)
  const historyEnabled = await settingValue(service, 'chat_history_enabled', true)
  const { data: history } = historyEnabled
    ? await service.from('note_chat_messages').select('role, content').eq('note_id', note.id).eq('user_id', user.id).order('created_at', { ascending: false }).limit(8)
    : { data: [] }
  try {
    const result = await answerQuestion({ note, question, history: (history || []).reverse() })
    let answer
    try {
      const validated = validateChatAnswer(result.parsed)
      if (!validated.ok) throw new Error('schema')
      answer = validated.value
    } catch {
      const invalid = new Error('schema')
      invalid.code = 'invalid_ai_json'
      throw invalid
    }
    await recordUsage(service, {
      user_id: user.id,
      operation: 'chat',
      provider: result.provider,
      model: result.model,
      status: 'success',
      input_tokens: result.usage?.prompt_tokens || null,
      output_tokens: result.usage?.completion_tokens || null,
    })
    let messageId = null
    if (historyEnabled !== false) {
      const { data: rows } = await service.from('note_chat_messages').insert([
        { user_id: user.id, note_id: note.id, role: 'user', content: question },
        {
          user_id: user.id,
          note_id: note.id,
          role: 'assistant',
          content: answer.answer,
          grounded: answer.grounded,
          missing_information: answer.missing_information,
        },
      ]).select('id, role')
      messageId = rows?.find((row) => row.role === 'assistant')?.id || null
    }
    return json({
      ok: true,
      data: {
        answer: answer.answer,
        grounded: answer.grounded,
        missingInformation: answer.missing_information,
        messageId,
      },
    })
  } catch (error) {
    await recordUsage(service, {
      user_id: user.id,
      operation: 'chat',
      provider: providerName('llm'),
      status: 'failed',
      error_code: error.code || 'processing_failed',
    })
    throw error
  }
})
