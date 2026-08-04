export interface PrijsgroepAanpassing {
  kortingspercentage: number | null;
  opslagpercentage: number | null;
}

export function pasPrijsgroepToe(prijs: number, prijsgroep: PrijsgroepAanpassing | null): number {
  if (!prijsgroep) return prijs;
  const factor =
    prijsgroep.kortingspercentage != null
      ? 1 - prijsgroep.kortingspercentage / 100
      : 1 + (prijsgroep.opslagpercentage ?? 0) / 100;
  return Math.round(prijs * factor * 100) / 100;
}
