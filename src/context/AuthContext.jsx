import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

const AuthContext = createContext(null)

async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) throw error
  const { data: preferences, error: prefError } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (prefError) throw prefError
  return { ...data, preferences }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(!supabaseConfigError)
  const [authNotice, setAuthNotice] = useState('')

  const applySession = useCallback(async (nextSession) => {
    setSession(nextSession)
    if (!nextSession) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const nextProfile = await fetchProfile(nextSession.user.id)
      if (nextProfile.account_status !== 'active') {
        setAuthNotice('This account is deactivated. Contact an administrator if you need access.')
        await supabase.auth.signOut()
        setProfile(null)
        setSession(null)
      } else {
        setProfile(nextProfile)
      }
    } catch (error) {
      setAuthNotice(error.message || 'Your profile could not be loaded.')
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return undefined
    }
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => {
        if (active) applySession(nextSession)
      }, 0)
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [applySession])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return null
    const nextProfile = await fetchProfile(session.user.id)
    setProfile(nextProfile)
    return nextProfile
  }, [session])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      authNotice,
      clearNotice: () => setAuthNotice(''),
      refreshProfile,
      signOut,
      configured: !supabaseConfigError,
      configError: supabaseConfigError,
    }),
    [session, profile, loading, authNotice, refreshProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
