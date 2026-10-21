import { formatDuration } from '../utils/format'

export default function TranscriptViewer({ transcript, segments = [], onChange, readOnly = false }) {
  return (
    <div className="stack">
      {readOnly ? (
        <p style={{ whiteSpace: 'pre-wrap' }}>{transcript || 'No transcript saved.'}</p>
      ) : (
        <textarea className="textarea" value={transcript} onChange={(event) => onChange(event.target.value)} aria-label="Transcript" />
      )}
      {segments?.length ? (
        <div className="segment-list" aria-label="Transcript segments">
          {segments.map((segment, index) => (
            <div className="segment" key={`${segment.start}-${index}`}>
              <strong>
                {formatDuration(segment.start)}–{formatDuration(segment.end)}
              </strong>
              <span>{segment.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">Timestamped segments appear when the speech provider returns them.</p>
      )}
    </div>
  )
}
