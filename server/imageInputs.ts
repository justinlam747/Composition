import { readFile } from 'node:fs/promises';
import type { FileStore } from './storage';

export async function referenceImage(store: FileStore, id: string) {
  const asset = await store.requireAsset(id, 'reference');
  return { mimeType: asset.mimeType, data: (await readFile(store.file('assets', id, 'bin'))).toString('base64') };
}
