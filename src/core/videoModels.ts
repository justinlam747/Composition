export function veoInputError(duration: number, references: string[], baseline?: string, lastFrame?: string): string | undefined {
  if (![4, 6, 8].includes(duration)) return 'Veo needs a timeline of 4, 6 or 8 seconds. Update the timeline and create a new preview.';
  if (baseline && references.some(id => id !== baseline && id !== lastFrame)) return 'Veo uses either baseline frames or up to three reference images. Remove supporting references to use your baseline.';
  if (!baseline && references.length > 3) return 'Veo accepts up to three reference images. Remove extra references.';
  if ((!baseline && references.length > 0) && duration !== 8) return 'Veo needs 8 seconds when using reference images. Update the timeline and create a new preview.';
}
