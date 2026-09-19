import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/core/api';
import { makeProject } from '../src/core/project';
import { createProject, deleteSavedProject, importProject, openSavedProject, saveCurrentProject } from '../src/core/projectSession';
import { studio } from '../src/core/store';

describe('project session persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });
    studio.openProject({ ...makeProject(), name: 'Original' });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps the current scene and its history when saving before a switch fails', async () => {
    studio.rename('Unsaved original');
    const before = studio.get();
    vi.spyOn(api, 'saveProject').mockRejectedValue(new Error('Storage unavailable'));
    const load = vi.spyOn(api, 'project');
    await expect(openSavedProject('another-project')).rejects.toThrow('Storage unavailable');
    expect(studio.get().project).toEqual(before.project);
    expect(studio.get().undoCount).toBe(before.undoCount);
    expect(load).not.toHaveBeenCalled();
  });

  it('saves the draft before creating a distinct project and clears cross-project undo', async () => {
    studio.rename('Keep these edits');
    const original = studio.get().project;
    const save = vi.spyOn(api, 'saveProject').mockImplementation(async project => project);
    await createProject('  New take  ');
    expect(save.mock.calls[0][0]).toEqual(original);
    expect(studio.get().project.id).not.toBe(original.id);
    expect(studio.get().project.name).toBe('New take');
    expect(studio.get().undoCount).toBe(0);
    studio.undo(); expect(studio.get().project.name).toBe('New take');
  });

  it('validates imports before mutation and preserves edits before a valid import', async () => {
    studio.rename('Latest edit');
    const original = studio.get().project;
    const save = vi.spyOn(api, 'saveProject').mockImplementation(async project => project);
    await expect(importProject('{invalid')).rejects.toThrow();
    expect(save).not.toHaveBeenCalled(); expect(studio.get().project).toEqual(original);
    const incoming = makeProject();
    await importProject(JSON.stringify(incoming));
    expect(save).toHaveBeenCalledWith(original);
    expect(studio.get().project).toEqual(incoming);
    expect(studio.get().undoCount).toBe(0);
  });

  it('keeps the draft when the target fails to load or the new project cannot be saved', async () => {
    const original = studio.get().project;
    const save = vi.spyOn(api, 'saveProject').mockImplementation(async project => project);
    vi.spyOn(api, 'project').mockRejectedValue(new Error('Project missing'));
    await expect(openSavedProject('missing')).rejects.toThrow('Project missing');
    expect(studio.get().project).toEqual(original);
    save.mockImplementation(async project => { if (project.id !== original.id) throw new Error('Disk full'); return project; });
    await expect(createProject('Cannot save')).rejects.toThrow('Disk full');
    expect(studio.get().project).toEqual(original);
  });

  it('persists an edit that finishes while a save is in flight', async () => {
    const save = vi.spyOn(api, 'saveProject').mockImplementationOnce(async project => {
      studio.rename('Late edit'); return project;
    }).mockImplementation(async project => project);
    await saveCurrentProject();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].name).toBe('Late edit');
  });

  it('clears the deleted project draft and history so later saves cannot recreate it', async () => {
    studio.rename('Delete this draft');
    const deleted = studio.get().project.id;
    vi.spyOn(api, 'deleteProject').mockResolvedValue(undefined);
    await deleteSavedProject(deleted);
    expect(studio.getDraft()).toBeUndefined();
    expect(studio.get().project.id).not.toBe(deleted);
    expect(studio.get().undoCount).toBe(0);
    expect(localStorage.removeItem).toHaveBeenCalledWith('take-one-scene-v1');
    const save = vi.spyOn(api, 'saveProject').mockImplementation(async project => project);
    await createProject('Next project');
    expect(save.mock.calls.some(([project]) => project.id === deleted)).toBe(false);
  });

  it('preserves the draft when deletion fails or targets a different project', async () => {
    const draft = studio.getDraft();
    const remove = vi.spyOn(api, 'deleteProject').mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(undefined);
    await expect(deleteSavedProject(draft!.id)).rejects.toThrow('Disk unavailable');
    expect(studio.getDraft()).toEqual(draft);
    await deleteSavedProject('different-project');
    expect(remove).toHaveBeenCalledTimes(2);
    expect(studio.getDraft()).toEqual(draft);
  });
});
