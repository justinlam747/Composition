import { api } from './api';
import { makeProject, parseProject } from './project';
import { studio } from './store';

// Finish saving before replacing the browser's one recovery draft.
export async function saveCurrentProject() {
  let project;
  do {
    studio.persistNow();
    project = studio.get().project;
    await api.saveProject(project);
  } while (studio.get().project.id === project.id && studio.get().project !== project);
  studio.patch({ status: 'Project saved with all object and asset references.' });
}

export async function createProject(name: string) {
  if (studio.getDraft()) await saveCurrentProject();
  const project = { ...makeProject(), name: name.trim().slice(0, 120) || 'Untitled take' };
  await api.saveProject(project);
  studio.openProject(project);
}

export async function openSavedProject(id: string) {
  if (studio.getDraft()) await saveCurrentProject();
  studio.openProject(await api.project(id));
}

export async function importProject(raw: string) {
  const project = parseProject(raw);
  if (studio.getDraft()) await saveCurrentProject();
  studio.openProject(project);
}

export async function deleteSavedProject(id: string) {
  await api.deleteProject(id);
  studio.forgetProject(id);
}
