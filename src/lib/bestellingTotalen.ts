export interface BestellingRegel {
  prijs: number | null;
  quantity: number;
}

export interface BestellingTotalen {
  heeftOngeprijsdeRegel: boolean;
  regelsom: number | null;
  korting: number;
  totaalExclBtw: number | null;
  btwPercentage: number | null;
  btwBedrag: number | null;
  totaalInclBtw: number | null;
}

export function berekenBestellingTotalen(
  lines: BestellingRegel[],
  korting: number | null,
  btwPercentage: number | null
): BestellingTotalen {
  const heeftOngeprijsdeRegel = lines.some((line) => line.prijs === null);
  const regelsom = heeftOngeprijsdeRegel
    ? null
    : lines.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0);
  const kortingBedrag = korting ?? 0;
  const totaalExclBtw = regelsom === null ? null : Math.max(0, regelsom - kortingBedrag);
  const effectiefBtwPercentage = totaalExclBtw !== null ? btwPercentage : null;
  const btwBedrag =
    totaalExclBtw !== null && effectiefBtwPercentage != null ? totaalExclBtw * (effectiefBtwPercentage / 100) : null;
  const totaalInclBtw = totaalExclBtw !== null && btwBedrag !== null ? totaalExclBtw + btwBedrag : null;

  return {
    heeftOngeprijsdeRegel,
    regelsom,
    korting: kortingBedrag,
    totaalExclBtw,
    btwPercentage: effectiefBtwPercentage,
    btwBedrag,
    totaalInclBtw,
  };
}
