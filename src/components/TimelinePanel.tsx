import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronUp, Film, Pause, Play } from 'lucide-react';
import { studio, useStudio } from '../core/store';
import Timeline from './Timeline';

const MIN_HEIGHT = 180;

export default function TimelinePanel() {
  const s = useStudio();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const [height, setHeight] = useState(220);
  const [maxHeight, setMaxHeight] = useState(500);
  const [collapsed, setCollapsed] = useState(false);
  const expandedHeight = Math.max(MIN_HEIGHT, Math.min(height, maxHeight));

  useEffect(() => {
    if (s.timelineMode === 'value') setHeight(current => Math.max(current, 300));
  }, [s.timelineMode]);

  useLayoutEffect(() => {
    const editor = panel.current?.parentElement;
    if (!editor) return;
    editor.style.setProperty('--timeline-overlay-height', `calc(${collapsed ? 36 : expandedHeight}px + env(safe-area-inset-bottom))`);
    return () => { editor.style.removeProperty('--timeline-overlay-height'); };
  }, [collapsed, expandedHeight]);

  useEffect(() => {
    const parent = panel.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) => {
      const safeArea = panel.current ? parseFloat(getComputedStyle(panel.current).paddingBottom) || 0 : 0;
      setMaxHeight(Math.max(MIN_HEIGHT, Math.floor(entry.contentRect.height / 2) - safeArea));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  function resize(next: number) { setHeight(Math.round(Math.max(MIN_HEIGHT, Math.min(maxHeight, next)))); }
  function stopResize() { drag.current = null; }

  return <div ref={panel} className={`timeline-panel${collapsed ? ' is-collapsed' : ''}`} style={{ '--timeline-height': `${expandedHeight}px` } as CSSProperties}>
    <div className="timeline-panel-header">
      <span className="timeline-panel-title"><Film size={13} />Timeline</span>
      {collapsed && <div className="timeline-mini-transport">
        <button className="icon-button" aria-label={s.playing ? 'Pause timeline' : 'Play timeline'} title={s.playing ? 'Pause' : 'Play'} onClick={studio.togglePlay}>{s.playing ? <Pause size={13} /> : <Play size={13} />}</button>
        <output aria-label="Current time">{s.time.toFixed(2)} / {s.project.duration.toFixed(2)} s</output>
      </div>}
      {!collapsed && <div className="timeline-resizer" role="separator" tabIndex={0} aria-label="Resize timeline" aria-orientation="horizontal" aria-valuemin={MIN_HEIGHT} aria-valuemax={maxHeight} aria-valuenow={expandedHeight} aria-controls="timeline-editor" title="Drag to resize timeline; use Up and Down arrows when focused"
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.focus();
          drag.current = { y: event.clientY, height: expandedHeight };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => { if (drag.current) resize(drag.current.height + drag.current.y - event.clientY); }}
        onPointerUp={stopResize} onPointerCancel={stopResize} onLostPointerCapture={stopResize}
        onKeyDown={event => {
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          resize(event.key === 'Home' ? MIN_HEIGHT : event.key === 'End' ? maxHeight : expandedHeight + (event.key === 'ArrowUp' ? 20 : -20));
        }}><span /></div>}
      <button className="icon-button timeline-collapse" aria-label={collapsed ? 'Expand timeline' : 'Minimize timeline'} title={collapsed ? 'Expand timeline' : 'Minimize timeline'} aria-expanded={!collapsed} aria-controls="timeline-editor" onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
    </div>
    <div id="timeline-editor" className="timeline-editor" hidden={collapsed}><Timeline collapsed={collapsed} /></div>
  </div>;
}
