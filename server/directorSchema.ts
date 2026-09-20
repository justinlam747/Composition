import { z } from 'zod';
import { directorResponseSchema } from '../src/core/director';

// Gemini 2.5 rejects this deeply nested action union with every application
// bound included. Keep the model's structural contract compact; the complete
// Zod schema and project validator still enforce every bound before execution.
const applicationOnly = new Set(['$schema', 'additionalProperties', 'minItems', 'maxItems', 'minimum', 'maximum', 'pattern', 'minLength', 'maxLength']);
function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !applicationOnly.has(key)).map(([key, item]) => key === 'const' ? ['enum', [item]] : [key, compact(item)]));
}
export const directorProviderSchema = compact(z.toJSONSchema(directorResponseSchema)) as Record<string, unknown>;

export function parseDirectorResponse(text: string) {
  const value = JSON.parse(text);
  // A bare six-digit color has exactly the same meaning as its CSS spelling.
  // Normalize only this representation; all commands and numbers remain strict.
  for (const action of Array.isArray(value?.actions) ? value.actions : []) {
    const geometry = action?.kind === 'create_object' ? action.spec?.geometry : action?.kind === 'update_object' ? action.geometry : undefined;
    for (const part of Array.isArray(geometry?.parts) ? geometry.parts : []) if (typeof part?.color === 'string' && /^[0-9a-fA-F]{6}$/.test(part.color)) part.color = `#${part.color}`;
  }
  return directorResponseSchema.parse(value);
}
