import { describe, expect, it } from 'vitest';
import { buildDrukkerMail } from '@/lib/buildDrukkerMail';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';

function klant(overrides: Partial<Klant> = {}): Klant {
  return {
    id: 'uid-1',
    companyName: 'Testbedrijf BV',
    kvk: '12345678',
    contactPerson: 'Jan Jansen',
    email: 'jan@example.com',
    phone: '0612345678',
    contactPreference: 'email',
    address: 'Teststraat 1',
    postcode: '1234 AB',
    city: 'Teststad',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    status: 'Goedgekeurd',
    prijsgroepId: 'pg-1',
    ...overrides,
  };
}

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: '',
    naam: 'Hotel paneel',
    artiest: '',
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    prijzen: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
const MATERIALEN: Materiaal[] = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' }];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];

function bestelling(overrides: Partial<Bestelling> = {}): Bestelling {
  return {
    id: 'header-1',
    klantId: 'uid-1',
    companyName: 'Testbedrijf BV',
    besteldatum: '1-7-2026',
    status: 'Te versturen naar drukker',
    lineCount: 1,
    totalQuantity: 2,
    lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    ...overrides,
  };
}

describe('buildDrukkerMail', () => {
  it('includes the bedrijfsnaam, standaardadres, and regel details for a single klant', () => {
    const mail = buildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('== Testbedrijf BV ==');
    expect(mail.body).toContain('Afleveradres: Teststraat 1, 1234 AB Teststad');
    expect(mail.body).toContain('Hotel paneel — 6mm Glas — Helder, maat 40×60 cm, aantal 2');
  });

  it('uses the delivery address instead of the standaardadres when it is set', () => {
    const mail = buildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant({ deliveryAddress: 'Havenweg 5', deliveryPostcode: '5678 CD', deliveryCity: 'Havenstad' })],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('Afleveradres: Havenweg 5, 5678 CD Havenstad');
    expect(mail.body).not.toContain('Teststraat 1');
  });

  it('groups multiple bestellingen from the same klant into a single section', () => {
    const mail = buildDrukkerMail({
      bestellingen: [
        bestelling({ id: 'header-1' }),
        bestelling({
          id: 'header-2',
          lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body.match(/== Testbedrijf BV ==/g)).toHaveLength(1);
    expect(mail.body).toContain('aantal 2');
    expect(mail.body).toContain('aantal 1');
  });

  it('creates a section per klant when bestellingen come from different klanten', () => {
    const mail = buildDrukkerMail({
      bestellingen: [bestelling({ id: 'header-1' }), bestelling({ id: 'header-2', klantId: 'uid-2', companyName: 'Ander Bedrijf' })],
      klanten: [klant(), klant({ id: 'uid-2', companyName: 'Ander Bedrijf' })],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('== Testbedrijf BV ==');
    expect(mail.body).toContain('== Ander Bedrijf ==');
  });

  it('describes a custom-size line using its breedte/hoogte instead of a maat lookup', () => {
    const mail = buildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: 275, quantity: 1 },
          ],
        }),
      ],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.body).toContain('maat 90×140 cm');
  });

  it('sets a subject mentioning the drukker order', () => {
    const mail = buildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      kunstwerken: KUNSTWERKEN,
      materialen: MATERIALEN,
      maten: MATEN,
      materiaalsoorten: MATERIAALSOORTEN,
    });
    expect(mail.subject).toContain('Nieuwe order(s) voor de drukker');
  });
});
