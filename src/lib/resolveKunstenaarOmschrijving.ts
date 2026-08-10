import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import { resolveOmschrijving } from './resolveOmschrijving';

export function resolveKunstenaarOmschrijving(kunstenaar: Kunstenaar, locale: string): string {
  return resolveOmschrijving(kunstenaar, locale);
}

export function appendKunstenaarWebsiteZin(omschrijving: string, zin: string | null): string {
  return zin ? `${omschrijving}\n\n${zin}` : omschrijving;
}
