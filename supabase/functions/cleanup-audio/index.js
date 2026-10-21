import { requireUser } from '../_shared/auth.js'
import { json, readBody, servePost } from '../_shared/http.js'

servePost(async (req) => {
  const { user, service } = await requireUser(req)
  const body = await readBody(req)
  const { data: audio } = await service.from('audio_files').select('*').eq('id', body.audioFileId).eq('user_id', user.id).maybeSingle()
  if (!audio) {
    const missing = new Error('missing')
    missing.code = 'not_found'
    throw missing
  }
  if (audio.storage_path && !audio.removed_at) {
    const { error } = await service.storage.from('voice-recordings').remove([audio.storage_path])
    if (error) {
      const cleanupError = new Error('storage')
      cleanupError.code = 'processing_failed'
      throw cleanupError
    }
  }
  if (body.deleteNote) {
    await service.from('notes').delete().eq('audio_file_id', audio.id).eq('user_id', user.id)
  }
  const { error: deleteError } = await service.from('audio_files').delete().eq('id', audio.id).eq('user_id', user.id)
  if (deleteError) throw deleteError
  return json({ ok: true, data: { deleted: true } })
})
