import { createClient } from 'npm:@supabase/supabase-js@2'

export async function requireUser(req) {
  const header = req.headers.get('Authorization') || ''
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !serviceKey) {
    const error = new Error('config')
    error.code = 'ai_not_configured'
    error.status = 500
    throw error
  }
  if (!header.startsWith('Bearer ')) {
    const error = new Error('auth')
    error.code = 'unauthorized'
    throw error
  }
  const userClient = createClient(url, anon, { global: { headers: { Authorization: header } }, auth: { persistSession: false } })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) {
    const authError = new Error('auth')
    authError.code = 'unauthorized'
    throw authError
  }
  const service = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, role, account_status, email, full_name')
    .eq('id', data.user.id)
    .single()
  if (profileError || !profile) {
    const missing = new Error('profile')
    missing.code = 'unauthorized'
    throw missing
  }
  if (profile.account_status !== 'active') {
    const inactive = new Error('inactive')
    inactive.code = 'account_deactivated'
    throw inactive
  }
  return { user: data.user, profile, service }
}

export function requireAdmin(profile) {
  if (profile.role !== 'admin') {
    const error = new Error('admin')
    error.code = 'forbidden'
    throw error
  }
}
