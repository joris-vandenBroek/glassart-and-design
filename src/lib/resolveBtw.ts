import type { BtwTarief } from '@/components/beheer/btwTarievenTypes';

export function resolveBtwPercentage(tarieven: BtwTarief[], land: string | null): number | null {
  if (!land) return null;
  return tarieven.find((tarief) => tarief.land === land)?.percentage ?? null;
}
