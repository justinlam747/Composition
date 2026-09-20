import { studio, useStudio, type EditorState } from '../core/store';

export default function TimelineModeSelect() {
  const { timelineMode } = useStudio();
  return <select className="timeline-mode-switch" aria-label="Timeline mode" value={timelineMode}
    onChange={event => studio.patch({ timelineMode: event.target.value as EditorState['timelineMode'], selectedVelocityKey: null, selectionActive: false })}>
    <option value="keys">Keyframes</option><option value="value">Value graph</option><option value="velocity">Velocity</option>
  </select>;
}
