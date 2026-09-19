import { useEffect, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowRight, ChevronDown, Clock3, Film, FolderOpen, HardDrive, LayoutGrid, MoreHorizontal, Plus, Search, Shapes, Trash2 } from 'lucide-react';
import { api, type ProjectSummary } from '../core/api';
import { createProject, deleteSavedProject, openSavedProject } from '../core/projectSession';
import { studio } from '../core/store';
import ProjectNameDialog from './ProjectNameDialog';
import ProjectPreviewImage from './ProjectPreviewImage';
import DropdownMenu from './DropdownMenu';
import ProjectDeleteDialog from './ProjectDeleteDialog';

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
type Collection = 'all' | 'recent' | 'animated';

export default function HomePage({ onOpen, onOutput }: { onOpen: () => void; onOutput: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [collection, setCollection] = useState<Collection>('all');
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const newProjectButton = useRef<HTMLButtonElement>(null);
  const draft = studio.getDraft();

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.projects().then(items => { if (active) setProjects(items); }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load projects.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const quickProjects = (draft ? [draft, ...recent.filter(project => project.id !== draft.id)] : recent).slice(0, 6);
  const visible = collection === 'recent' ? recent : collection === 'animated' ? projects.filter(project => project.hasMotion) : projects;
  const filtered = visible.filter(project => project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt));
  async function open(id: string, destination: 'editor' | 'output' = 'editor') {
    if (opening) return;
    setOpening(id); setError('');
    try {
      if (studio.getDraft()?.id !== id) await openSavedProject(id);
      else studio.persistNow();
      if (destination === 'output') onOutput(); else onOpen();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this project.'); }
    finally { setOpening(null); }
  }
  const collections = [
    { id: 'all' as const, label: 'All projects', icon: LayoutGrid, count: projects.length },
    { id: 'recent' as const, label: 'Recent', icon: Clock3, count: recent.length },
    { id: 'animated' as const, label: 'Animated', icon: Film, count: projects.filter(project => project.hasMotion).length },
  ];

  return <div className="home-shell">
    <aside className="home-sidebar" aria-label="Workspace sidebar">
      <div className="brand home-brand"><span className="brand-mark"><Shapes size={25} strokeWidth={1.6} /></span><span>composition<span className="brand-period">.</span></span></div>
      <button ref={newProjectButton} className="button primary new-project-button" disabled={!!opening} onClick={() => setCreating(true)}><Plus size={17} />New project</button>
      <nav className="home-navigation" aria-label="Project collections"><span className="sidebar-label">WORKSPACE</span>{collections.map(item => <button key={item.id} aria-label={item.label} title={item.label} aria-current={collection === item.id ? 'page' : undefined} onClick={() => { setCollection(item.id); setQuery(''); }}><item.icon size={17} strokeWidth={1.6} /><span>{item.label}</span>{!loading && <small>{item.count}</small>}</button>)}</nav>
      {quickProjects.length > 0 && <nav className="sidebar-project-links" aria-label="Quick access projects">{quickProjects.map(project => <a key={project.id} href="#editor" title={project.name} aria-disabled={!!opening} onClick={event => { event.preventDefault(); if (!opening) void open(project.id); }}>{project.name}</a>)}</nav>}
      <div className="sidebar-storage"><span className="storage-icon"><HardDrive size={17} /></span><div><strong>Local workspace</strong><span>Saved on this computer</span></div><span className="saved-dot" /></div>
    </aside>
    <main className="home-main">
      <header className="home-topbar"><div className="home-breadcrumb"><FolderOpen size={15} /><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>Projects</strong></div></header>
      <div className="home-content">
        <div className="home-heading"><div><span className="home-eyebrow">A LITTLE SPACE TO CREATE</span><h1>{collection === 'all' ? 'Projects' : collection === 'recent' ? 'Recent projects' : 'Animated projects'}<span className="heading-period" aria-hidden="true">.</span></h1><p>{collection === 'recent' ? 'Your six most recently saved scenes.' : collection === 'animated' ? 'Every scene with a little movement.' : 'Your ideas, scenes, and next great take.'}</p></div></div>
        <section className="project-library" aria-labelledby="saved-projects-title">
          <div className="library-toolbar"><h2 id="saved-projects-title">{collection === 'all' ? 'All projects' : collection === 'recent' ? 'Recently edited' : 'With animation'}</h2><div className="library-filters"><label className="project-search"><Search size={16} /><input aria-label="Search projects" placeholder="Search projects…" value={query} onChange={event => setQuery(event.target.value)} /></label><DropdownMenu className="project-sort" label="Sort projects" items={[
            { label: 'Last edited', checked: sort === 'recent', onSelect: () => setSort('recent') },
            { label: 'Name A–Z', checked: sort === 'name', onSelect: () => setSort('name') },
          ]}><ArrowDownWideNarrow size={16} /><span>{sort === 'recent' ? 'Last edited' : 'Name A–Z'}</span><ChevronDown size={13} /></DropdownMenu></div></div>
          {error && <div className="home-error" role="alert"><p>{error}</p><button className="button secondary" disabled={!!opening} onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
          {loading ? <div className="project-grid project-skeletons" role="status"><span className="sr-only">Loading your projects…</span>{[0, 1, 2, 3].map(item => <div className="project-skeleton" key={item}><div /><span /><small /></div>)}</div> : filtered.length ? <div className="project-grid" key={collection} aria-busy={!!opening}>{filtered.map(project => <article className="project-card-wrap" key={project.id}><button className="project-card" disabled={!!opening} onClick={() => void open(project.id)} aria-label={`Open project ${project.name}`}>
            <div className="project-art"><ProjectPreviewImage project={project} /><span className="project-kind">{project.hasMotion ? <Film size={12} /> : <Shapes size={12} />}{project.hasMotion ? 'Animation' : 'Scene'}</span><span className="project-duration">{project.duration.toFixed(0).padStart(2, '0')} SEC</span><span className="project-open" aria-hidden="true"><ArrowRight size={20} /></span></div>
            <div className="project-card-copy"><div><h3 title={project.name}>{project.name}</h3><p>{project.objectCount} {project.objectCount === 1 ? 'object' : 'objects'}<span>·</span>{project.hasMotion ? 'Animated scene' : 'Composition'}</p></div><time dateTime={project.updatedAt} title={new Date(project.updatedAt).toLocaleString()}>{opening === project.id ? 'Opening…' : date(project.updatedAt)}</time></div>
          </button><DropdownMenu className="project-card-menu" label={`Project actions for ${project.name}`} disabled={!!opening} items={[
            { label: 'Output', icon: <Film size={15} />, onSelect: () => { void open(project.id, 'output'); } },
            { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onSelect: () => setDeleting(project) },
          ]}><MoreHorizontal size={20} /></DropdownMenu></article>)}</div> : !error && <div className="projects-empty"><span className="empty-folder"><FolderOpen size={34} strokeWidth={1.3} /></span><h3>{query ? 'No matching projects' : collection === 'animated' ? 'A little movement goes a long way' : 'Your first take starts here'}</h3><p>{query ? 'Try another project name.' : collection === 'animated' ? 'Add motion to a scene and find it here.' : 'Create a project to start composing your scene.'}</p><button className="button secondary" onClick={() => query ? setQuery('') : collection === 'animated' ? setCollection('all') : setCreating(true)}>{query ? 'Clear search' : collection === 'animated' ? 'View all projects' : 'Create a project'}{!query && collection !== 'animated' && <Plus size={16} />}</button></div>}
        </section>
      </div>
    </main>
    {creating && <ProjectNameDialog name="Untitled take" title="New project" action="Create project" onClose={() => setCreating(false)} onSubmit={async name => { await createProject(name); onOpen(); }} />}
    {deleting && <ProjectDeleteDialog name={deleting.name} returnFocus={newProjectButton} onClose={() => setDeleting(null)} onDelete={async () => {
      await deleteSavedProject(deleting.id);
      setProjects(items => items.filter(project => project.id !== deleting.id));
    }} />}
  </div>;
}
