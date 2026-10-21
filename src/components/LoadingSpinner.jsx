export default function LoadingSpinner({ label = 'Loading', large = false }) {
  return (
    <div className="center-state" role="status">
      <div className={large ? 'spinner spinner-lg' : 'spinner'} />
      <span>{label}</span>
    </div>
  )
}
