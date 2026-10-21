export default function ErrorMessage({ message, onRetry }) {
  if (!message) return null
  return (
    <div className="message message-error" role="alert">
      <strong>{message}</strong>
      {onRetry ? (
        <div className="hero-actions">
          <button className="btn btn-secondary btn-small" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  )
}
