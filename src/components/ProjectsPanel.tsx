import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, type ProjectSummary } from '../core/api';
export default function ProjectsPanel({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => Promise<void> }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]), [error, setError] = useState('');
  useEffect(() => { let active = true; api.projects().then(items => { if (active) setProjects(items); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  return <aside className="assistant-panel" aria-label="Saved projects"><div className="panel-heading"><h2>Saved projects</h2><button className="icon-button" aria-label="Close projects panel" onClick={onClose}><X size={19} /></button></div><p className="panel-copy">Projects and their reference images are stored on this server.</p>{projects.map(project => <button className="saved-project" key={project.id} onClick={async () => { try { await onOpen(project.id); } catch (e) { setError((e as Error).message); } }}><strong>{project.name}</strong><small>{new Date(project.updatedAt).toLocaleString()}</small></button>)}{!projects.length && !error && <p className="panel-copy">Use Save project in the scene menu to save your first project.</p>}{error && <p role="alert" className="inline-error">{error}</p>}</aside>;
}
