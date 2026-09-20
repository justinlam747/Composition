import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../core/api';
import type { PromptTarget, RefinedPrompt } from '../core/outputPrompts';
import { studio, useStudio } from '../core/store';
import ServiceIcon from './ServiceIcon';

export default function OutputPromptField({ target, title, value, onChange, configured, disabled, context = '', children }: {
  target: PromptTarget; title: ReactNode; value: string; onChange: (value: string) => void;
  configured: boolean; disabled: boolean; context?: string; children?: ReactNode;
}) {
  const s = useStudio(), [draft, setDraft] = useState<RefinedPrompt | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const original = useRef('');
  const name = target === 'video' ? 'video direction' : 'visual baseline';
  useEffect(() => {
    request.current?.abort(); request.current = null; setBusy(false); setDraft(null); setError('');
    return () => { request.current?.abort(); request.current = null; };
  }, [s.project.id, s.project.generation?.guideAssetId]);
  async function generate(regenerate = false) {
    if (disabled || !configured || request.current) return;
    const prompt = regenerate ? original.current : (value.trim() || context.trim());
    if (!prompt) return;
    original.current = prompt;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      const result = await api.refinePrompt(studio.get().project, target, prompt, regenerate ? draft?.prompt : undefined, controller.signal);
      if (!controller.signal.aborted) setDraft(result);
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  return <div className="output-prompt-field">
    <div className="output-section-title"><div>{title}</div><button className="button secondary output-prompt-generate" aria-label={`Generate ${name} prompt`} disabled={disabled || busy || !configured || !(value.trim() || context.trim())} onClick={() => void generate()}><ServiceIcon service="gemini" />{busy ? 'Drafting…' : 'Generate prompt'}</button></div>
    {children}
    <label className="sr-only" htmlFor={`output-${target}-prompt`}>{target === 'video' ? 'Video instructions' : 'Image prompt'}</label>
    <textarea id={`output-${target}-prompt`} rows={3} maxLength={4000} value={value} disabled={disabled || busy} onChange={event => { onChange(event.target.value); setDraft(null); }} placeholder={target === 'video' ? 'Describe the video you have in mind…' : 'Describe a character, setting or style…'} />
    {!configured && <p className="output-note">Connect Gemini on the server to generate prompts.</p>}
    {draft && <section className="output-prompt-draft" aria-label={`Suggested ${name} prompt`}>
      <strong>Suggested prompt</strong><p className="output-note">{draft.intent}</p>
      <textarea aria-label={`Refined ${name} prompt`} rows={5} maxLength={4000} value={draft.prompt} disabled={disabled || busy} onChange={event => setDraft({ ...draft, prompt: event.target.value })} />
      <details><summary>Creative choices</summary><dl>{Object.entries(draft.qualities).map(([key, text]) => <div key={key}><dt>{key}</dt><dd>{text}</dd></div>)}</dl></details>
      <div className="output-image-actions"><button className="button secondary" disabled={disabled || busy || !draft.prompt.trim()} onClick={() => { onChange(draft.prompt); setDraft(null); }}>Use prompt</button><button className="text-link" disabled={disabled || busy} onClick={() => void generate(true)}>Regenerate prompt</button><button className="text-link" disabled={busy} onClick={() => setDraft(null)}>Dismiss</button></div>
    </section>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
