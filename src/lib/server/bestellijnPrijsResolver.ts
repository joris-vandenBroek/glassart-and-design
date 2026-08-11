import { berekenBestellijnPrijs, type Queryable } from '@/lib/server/prijsmodule';
import { checkOrderRight } from '@/lib/server/orderRight';

export interface BestellijnAdditionInput {
  kunstwerkId: string;
  materiaalId: string;
  maatId: string;
  breedte?: number;
  hoogte?: number;
}

export type BestellijnPrijsResultaat =
  | { status: 'vast'; code: string; prijs: number }
  | { status: 'op-aanvraag'; code: string }
  | { status: 'onbekend'; code: string }
  | {
      status: 'fout';
      error: 'kunstwerk-not-found' | 'order-not-allowed' | 'materiaal-niet-beschikbaar' | 'maat-niet-beschikbaar' | 'afmeting-vereist';
    };

/**
 * Valideert en prijst een nieuwe bestellijn -- gedeeld tussen de echte toevoeging
 * (PATCH .../wijzigen) en de live prijsvoorbeeld-lookup (GET .../prijsvoorbeeld), zodat
 * beide altijd exact dezelfde validatie en prijsmodule-uitkomst geven. Doet geen enkele
 * schrijfactie; de aanroeper beslist zelf of/hoe het resultaat wordt opgeslagen.
 */
export async function resolveerBestellijnPrijs(
  connection: Queryable,
  input: BestellijnAdditionInput,
  klantId: string | null
): Promise<BestellijnPrijsResultaat> {
  const [kunstwerkRows] = await connection.query(
    'SELECT code, kunstenaarnr, prijsPerM2 FROM kunstwerken WHERE id = ?',
    [input.kunstwerkId]
  );
  const kunstwerk = (
    kunstwerkRows as Array<{ code: string; kunstenaarnr: string | null; prijsPerM2: number | null }>
  )[0];
  if (!kunstwerk) {
    return { status: 'fout', error: 'kunstwerk-not-found' };
  }
  if (!(await checkOrderRight(connection, input.kunstwerkId, klantId ?? ''))) {
    return { status: 'fout', error: 'order-not-allowed' };
  }

  const [maatRows] = await connection.query('SELECT maatId FROM kunstwerkMaten WHERE kunstwerkId = ?', [
    input.kunstwerkId,
  ]);
  const [materiaalRows] = await connection.query(
    'SELECT materiaalId FROM kunstwerkMaterialen WHERE kunstwerkId = ?',
    [input.kunstwerkId]
  );
  const maatIds = (maatRows as Array<{ maatId: string }>).map((r) => r.maatId);
  const materiaalIds = (materiaalRows as Array<{ materiaalId: string }>).map((r) => r.materiaalId);

  if (materiaalIds.length > 0 && !materiaalIds.includes(input.materiaalId)) {
    return { status: 'fout', error: 'materiaal-niet-beschikbaar' };
  }
  if (input.maatId === '') {
    if (
      !Number.isInteger(input.breedte) ||
      (input.breedte as number) <= 0 ||
      !Number.isInteger(input.hoogte) ||
      (input.hoogte as number) <= 0
    ) {
      return { status: 'fout', error: 'afmeting-vereist' };
    }
  } else if (maatIds.length > 0 && !maatIds.includes(input.maatId)) {
    return { status: 'fout', error: 'maat-niet-beschikbaar' };
  }

  const resultaat = await berekenBestellijnPrijs(
    connection,
    { kunstenaarnr: kunstwerk.kunstenaarnr, maatIds, prijsPerM2: kunstwerk.prijsPerM2 },
    input,
    klantId
  );
  if (resultaat.status === 'vast') {
    return { status: 'vast', code: kunstwerk.code, prijs: resultaat.prijs };
  }
  if (resultaat.status === 'op-aanvraag') {
    return { status: 'op-aanvraag', code: kunstwerk.code };
  }
  return { status: 'onbekend', code: kunstwerk.code };
}

/** HTTP-statuscode per foutcode, gedeeld tussen de twee routes die deze resolver aanroepen. */
export function statusVoorFout(error: Extract<BestellijnPrijsResultaat, { status: 'fout' }>['error']): number {
  return error === 'order-not-allowed' ? 403 : 400;
}
