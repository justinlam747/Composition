import { Pause, Play, Repeat2, SkipBack, SkipForward } from 'lucide-react';
import { studio, useStudio } from '../core/store';

export default function TimelineTransport({ keyTimes, duration, offset, velocity = false }: { keyTimes: number[]; duration: number; offset: number; velocity?: boolean }) {
  const s = useStudio();
  const time = Math.max(0, Math.min(duration, s.time - offset));
  const name = velocity ? 'velocity keyframe' : 'keyframe';
  return <div className="transport">
    <button className="icon-button" aria-label={`Previous ${name}`} title={`Previous ${name}`} onClick={() => studio.seek(offset + ([...keyTimes].reverse().find(t => t < time - .02) ?? 0))}><SkipBack size={16} /></button>
    <button className="play-button" aria-label={s.playing ? 'Pause timeline' : 'Play timeline'} title="Play / pause (Space)" disabled={!s.project.camera && !s.project.objects.some(o => !o.hidden)} onClick={studio.togglePlay}>{s.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
    <button className="icon-button" aria-label={`Next ${name}`} title={`Next ${name}`} onClick={() => studio.seek(offset + (keyTimes.find(t => t > time + .02) ?? duration))}><SkipForward size={16} /></button>
    <output className="timecode" aria-label="Current time" aria-live="off">{time.toFixed(2)}<span> / {duration.toFixed(2)} s</span></output>
    <button className={`icon-button ${s.loop ? 'is-on' : ''}`} aria-label="Loop timeline" aria-pressed={s.loop} title="Loop timeline" onClick={() => studio.patch({ loop: !s.loop })}><Repeat2 size={17} /></button>
  </div>;
}
