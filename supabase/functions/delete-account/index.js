import { requireUser } from '../_shared/auth.js'
import { json, readBody, servePost } from '../_shared/http.js'

servePost(async (req) => {
  const { user, service } = await requireUser(req)
  const body = await readBody(req)
  if (body.confirmation !== 'DELETE') {
    const error = new Error('confirm')
    error.code = 'confirmation_required'
    throw error
  }
  const { data: files } = await service.from('audio_files').select('storage_path').eq('user_id', user.id)
  const paths = (files || []).map((file) => file.storage_path).filter(Boolean)
  if (paths.length) await service.storage.from('voice-recordings').remove(paths)
  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) {
    const deleteError = new Error('delete')
    deleteError.code = 'processing_failed'
    throw deleteError
  }
  return json({ ok: true, data: { deleted: true } })
})
