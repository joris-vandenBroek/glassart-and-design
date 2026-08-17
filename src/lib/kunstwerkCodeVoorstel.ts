export interface KunstwerkCode {
  code: string;
}

interface CodeOnderdelen {
  prefix: string;
  getal: number;
}

function ontleedCode(code: string): CodeOnderdelen | null {
  const laatsteStreepje = code.lastIndexOf('-');
  if (laatsteStreepje === -1) return null;
  const prefix = code.slice(0, laatsteStreepje);
  const staart = code.slice(laatsteStreepje + 1);
  if (!/^\d+$/.test(staart)) return null;
  return { prefix, getal: parseInt(staart, 10) };
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

const VOLGNUMMER_BREEDTE = 4;

/**
 * Haalt een afsluitend volgnummer van een prefix af. Het prefix-veld in beheer is vrije
 * tekst met een keuzelijst; wie daar een héle code in plakt kreeg voorheen een volgnummer
 * áchter die code geplakt. Zo zijn GLA-ABS-0028-00001 en GLA-ANI-015-00001 in de echte
 * data ontstaan, en omdat de prefixlijst uit de bestaande codes wordt afgeleid, kwam die
 * foute prefix daarna ook nog in de keuzelijst terecht.
 */
function schoonPrefix(prefix: string): string {
  return prefix.trim().replace(/-\d+$/, '');
}

export function stelVolgendeCodeVoor(kunstwerken: KunstwerkCode[], prefix: string): string {
  const getrimdePrefix = schoonPrefix(prefix);
  const sleutel = getrimdePrefix.toLowerCase();
  const treffers = kunstwerken
    .map(({ code }) => ontleedCode(code))
    .filter(
      (onderdelen): onderdelen is CodeOnderdelen =>
        onderdelen !== null && onderdelen.prefix.toLowerCase() === sleutel
    );

  // Vaste breedte, niet meer de breedte van de breedste bestaande code van dit prefix.
  // Die regel bestond om een lopende reeks niet halverwege van breedte te laten wisselen,
  // maar na de migratie van 17-08-2026 is elke reeks vier cijfers breed en zou hij een
  // oude breedte alleen nog maar kunnen laten terugkomen. Voorbij 9999 wint het getal van
  // de breedte -- dan wijkt de code af van het standaardpatroon en vraagt beheer bij het
  // opslaan om een bevestiging, wat precies het bedoelde signaal is.
  const hoogsteGetal = treffers.length === 0 ? 0 : Math.max(...treffers.map((t) => t.getal));
  return `${getrimdePrefix}-${String(hoogsteGetal + 1).padStart(VOLGNUMMER_BREEDTE, '0')}`;
}
