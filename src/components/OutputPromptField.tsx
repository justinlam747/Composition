import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../core/api';
import type { PromptTarget } from '../core/outputPrompts';
import { studio, useStudio } from '../core/store';

export default function OutputPromptField({ target, title, value, onChange, configured, disabled, context = '', children }: {
  target: PromptTarget; title: ReactNode; value: string; onChange: (value: string) => void;
  configured: boolean; disabled: boolean; context?: string; children?: ReactNode;
}) {
  const s = useStudio(), [optimizedPrompt, setOptimizedPrompt] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const original = useRef('');
  const name = target === 'video' ? 'video direction' : 'visual baseline';
  useEffect(() => {
    request.current?.abort(); request.current = null; setBusy(false); setOptimizedPrompt(''); setError('');
    return () => { request.current?.abort(); request.current = null; };
  }, [s.project.id, s.project.generation?.guideAssetId]);
  async function optimize() {
    if (disabled || !configured || request.current) return;
    const reoptimize = !!optimizedPrompt;
    const prompt = reoptimize ? original.current : (value.trim() || context.trim());
    if (!prompt) return;
    original.current = prompt;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      const result = await api.refinePrompt(studio.get().project, target, prompt, reoptimize ? value : undefined, controller.signal);
      if (!controller.signal.aborted) { onChange(result.prompt); setOptimizedPrompt(result.prompt); }
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  return <div className="output-prompt-field">
    <div className="output-section-title"><div>{title}</div></div>
    {children}
    <label className="sr-only" htmlFor={`output-${target}-prompt`}>{target === 'video' ? 'Video instructions' : 'Image prompt'}</label>
    <div className="output-prompt-input">
      <textarea id={`output-${target}-prompt`} rows={3} maxLength={4000} value={value} disabled={disabled || busy} onChange={event => onChange(event.target.value)} placeholder={target === 'video' ? 'Describe the video you have in mind…' : 'Describe a character, setting or style…'} />
      <button className="output-prompt-optimize" aria-label={`${optimizedPrompt ? 'Reoptimize' : 'Optimize'} ${name} prompt`} disabled={disabled || busy || !configured || !(value.trim() || context.trim())} onClick={() => void optimize()}><Sparkles size={14} />{busy ? 'Optimizing…' : optimizedPrompt ? 'Reoptimize' : 'Optimize'}</button>
    </div>
    {!configured && <p className="output-note">Connect Gemini on the server to optimize prompts.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
