import { logActiviteit } from '@/lib/logActiviteit';
import type { Bestelling } from '@/components/beheer/BestellingenSection';

export interface AfrondResultaat {
  afgerond: Bestelling[];
  mislukt: Bestelling[];
}

/**
 * Zet elke meegegeven bestelling op "Te factureren" en logt per geslaagde bestelling
 * één activiteit. Een mislukte PATCH laat de bestelling ongemoeid en komt in
 * `mislukt` terecht -- de aanroeper hoort dat aan de medewerker te melden in
 * plaats van stilzwijgend alles als gelukt te tonen.
 */
export async function afrondBestellingen(bestellingen: Bestelling[]): Promise<AfrondResultaat> {
  const resultaten = await Promise.all(
    bestellingen.map(async (bestelling) => {
      try {
        const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'Te factureren' }),
        });
        if (!response.ok) {
          return { bestelling, gelukt: false };
        }
        void logActiviteit('bestelling_afgerond', bestelling.bestelnr);
        return { bestelling, gelukt: true };
      } catch {
        return { bestelling, gelukt: false };
      }
    })
  );

  return {
    afgerond: resultaten
      .filter((r) => r.gelukt)
      .map((r) => ({ ...r.bestelling, status: 'Te factureren' as const })),
    mislukt: resultaten.filter((r) => !r.gelukt).map((r) => r.bestelling),
  };
}
