import { useEffect, useState, useSyncExternalStore } from 'react';
import Editor from './Editor';
import HomePage from './components/HomePage';
import OutputPage from './components/OutputPage';
import { studio } from './core/store';

const currentPage = () => location.hash === '#output' ? 'output' : location.hash === '#editor' ? 'editor' : 'home';

export default function App() {
  const [page, setPage] = useState(currentPage);
  const projectId = useSyncExternalStore(studio.subscribe, () => studio.get().project.id);
  useEffect(() => {
    function navigate() {
      if (studio.get().exporting) { location.hash = 'output'; return; }
      studio.patch({ playing: false, preview: null });
      studio.persistNow();
      setPage(currentPage());
    }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const openEditor = () => { location.hash = 'editor'; };
  if (page === 'home') return <HomePage onOpen={openEditor} onOutput={() => { location.hash = 'output'; }} />;
  return <>
    <div className={page === 'output' ? 'editor-suspended' : undefined} inert={page === 'output'} aria-hidden={page === 'output' || undefined}>
      <Editor active={page === 'editor'} onHome={() => { location.hash = ''; }} onOutput={() => { location.hash = 'output'; }} />
    </div>
    {page === 'output' && <OutputPage key={projectId} onBack={openEditor} />}
  </>;
}
