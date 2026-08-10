import type { Kunstwerk } from '@/components/beheer/materiaalTypes';
import { resolveOmschrijving } from './resolveOmschrijving';

export function resolveKunstwerkOmschrijving(kunstwerk: Kunstwerk, locale: string): string {
  return resolveOmschrijving(kunstwerk, locale);
}
