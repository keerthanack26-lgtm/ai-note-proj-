export default function AuthSplitLayout({ children, className = '', videoHeader = null, videoFooter = null }) {
  return (
    <main className={className ? `auth-split ${className}` : 'auth-split'}>
      <aside className="auth-video-panel">
        <video className="auth-video" src="/videos/auth-background.mp4" autoPlay muted loop playsInline aria-hidden="true" />
        <div className="auth-video-overlay" aria-hidden="true" />
        {videoHeader}
        {videoFooter}
      </aside>
      <section className="auth-form-panel">{children}</section>
    </main>
  )
}
