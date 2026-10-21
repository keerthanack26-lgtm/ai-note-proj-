import { PROCESS_STAGES } from '../utils/constants'
import StatusBadge from './StatusBadge'

export default function ProcessingStatus({ stage, status, errorMessage }) {
  const order = PROCESS_STAGES.map((item) => item.id)
  const currentIndex = order.indexOf(stage)
  return (
    <div className="stack">
      <div className="meta">
        <StatusBadge value={status || stage} />
        {errorMessage ? <span>{errorMessage}</span> : null}
      </div>
      <ol className="stage-list">
        {PROCESS_STAGES.map((item, index) => {
          let className = ''
          if (status === 'failed' && item.id === stage) className = 'failed'
          else if (status === 'completed' || (currentIndex > index && stage !== 'failed')) className = 'done'
          else if (item.id === stage) className = 'current'
          return (
            <li key={item.id} className={className}>
              <span>{item.label}</span>
              <span>{className === 'done' ? 'Done' : className === 'current' ? 'Current' : className === 'failed' ? 'Failed' : 'Waiting'}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
