export interface KunstwerkCode {
  code: string;
}

interface CodeOnderdelen {
  prefix: string;
  getal: number;
  breedte: number;
}

function ontleedCode(code: string): CodeOnderdelen | null {
  const laatsteStreepje = code.lastIndexOf('-');
  if (laatsteStreepje === -1) return null;
  const prefix = code.slice(0, laatsteStreepje);
  const staart = code.slice(laatsteStreepje + 1);
  if (!/^\d+$/.test(staart)) return null;
  return { prefix, getal: parseInt(staart, 10), breedte: staart.length };
}

export function vindBekendePrefixen(kunstwerken: KunstwerkCode[]): string[] {
  const canoniekePerSleutel = new Map<string, string>();
  for (const { code } of kunstwerken) {
    const onderdelen = ontleedCode(code);
    if (!onderdelen) continue;
    const sleutel = onderdelen.prefix.toLowerCase();
    if (!canoniekePerSleutel.has(sleutel)) {
      canoniekePerSleutel.set(sleutel, onderdelen.prefix);
    }
  }
  return [...canoniekePerSleutel.values()].sort((a, b) => a.localeCompare(b));
}

const NIEUW_PREFIX_BREEDTE = 5;

export function stelVolgendeCodeVoor(kunstwerken: KunstwerkCode[], prefix: string): string {
  const getrimdePrefix = prefix.trim();
  const sleutel = getrimdePrefix.toLowerCase();
  const treffers = kunstwerken
    .map(({ code }) => ontleedCode(code))
    .filter((onderdelen): onderdelen is CodeOnderdelen => onderdelen !== null && onderdelen.prefix.toLowerCase() === sleutel);

  if (treffers.length === 0) {
    return `${getrimdePrefix}-${'1'.padStart(NIEUW_PREFIX_BREEDTE, '0')}`;
  }

  const hoogsteGetal = Math.max(...treffers.map((t) => t.getal));
  const breedte = Math.max(...treffers.map((t) => t.breedte));
  return `${getrimdePrefix}-${String(hoogsteGetal + 1).padStart(breedte, '0')}`;
}
