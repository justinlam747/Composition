import { useEffect, useRef, useState } from 'react';
import { ImageOff, Image } from 'lucide-react';
import type { ProjectSummary } from '../core/api';

export default function ProjectPreviewImage({ project }: { project: ProjectSummary }) {
  const host = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setImage(null); setFailed(false);
    const controller = new AbortController();
    const preview = project.preview;
    if (!preview) { setFailed(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void import('../scene/projectPreview').then(module => module.renderProjectPreview(`${project.id}:${project.updatedAt}`, preview, controller.signal))
        .then(result => { if (!controller.signal.aborted) setImage(result); })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    }, { rootMargin: '160px' });
    observer.observe(host.current!);
    return () => { controller.abort(); observer.disconnect(); };
  }, [project.id, project.updatedAt, project.preview]);
  return <div ref={host} className={`project-preview-image${image ? ' is-ready' : ''}`}>
    {image ? <img src={image} alt={`Preview of ${project.name}`} draggable={false} /> : <span className="preview-placeholder">{failed ? <ImageOff size={24} strokeWidth={1.3} /> : <Image size={24} strokeWidth={1.3} />}<span>{failed ? 'Preview unavailable' : 'Preparing preview'}</span></span>}
  </div>;
}
