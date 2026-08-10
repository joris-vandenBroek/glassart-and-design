import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import { resolveOmschrijving } from './resolveOmschrijving';

export function resolveKunstenaarOmschrijving(kunstenaar: Kunstenaar, locale: string): string {
  return resolveOmschrijving(kunstenaar, locale);
}
