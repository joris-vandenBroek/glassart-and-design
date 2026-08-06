import { describe, expect, it } from 'vitest';
import { buildDrukkerMail } from '@/lib/buildDrukkerMail';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';

const BEDRIJFSGEGEVENS_SEED: Bedrijfsgegevens = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartanddesign.com',
  whatsappNummer: '31600000000',
  tenaamstelling: 'Glassart & Design',
  bic: 'BANKNL2A',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: '', en: '', fr: '', de: '' },
  contactpersonen: [],
};

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
    kunstenaarId: null,
    ...overrides,
  };
}

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: '',
    naam: 'Hotel paneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
  {
    id: 'kw-2',
    foto: '',
    naam: 'Raampaneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    omschrijvingNl: 'Raampaneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    formaat: 'liggend',
  },
  {
    id: 'kw-3',
    foto: '',
    naam: 'Deurpaneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    omschrijvingNl: 'Deurpaneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    formaat: 'staand',
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
    bestelnr: 'GD-00401',
    besteldatum: '1-7-2026',
    status: 'Te versturen naar drukker',
    lineCount: 1,
    totalQuantity: 2,
    lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    ...overrides,
  };
}

function callBuildDrukkerMail(overrides: {
  bestellingen: Bestelling[];
  klanten: Klant[];
  kunstwerken?: Kunstwerk[];
  materialen?: Materiaal[];
  maten?: Maat[];
  materiaalsoorten?: Materiaalsoort[];
  bedrijfsgegevens?: Bedrijfsgegevens;
}) {
  return buildDrukkerMail({
    kunstwerken: KUNSTWERKEN,
    materialen: MATERIALEN,
    maten: MATEN,
    materiaalsoorten: MATERIAALSOORTEN,
    bedrijfsgegevens: BEDRIJFSGEGEVENS_SEED,
    ...overrides,
  });
}

describe('buildDrukkerMail', () => {
  it('includes the bedrijfsnaam, standaardadres, and regel details for a single klant', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.text).toContain('== Testbedrijf BV ==');
    expect(mail.text).toContain('Afleveradres: Teststraat 1, 1234 AB Teststad');
    expect(mail.text).toContain('Hotel paneel — 6mm Glas — Helder, maat 40×60 cm, aantal 2');
  });

  it('uses the delivery address instead of the standaardadres when it is set', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant({ deliveryAddress: 'Havenweg 5', deliveryPostcode: '5678 CD', deliveryCity: 'Havenstad' })],
    });
    expect(mail.text).toContain('Afleveradres: Havenweg 5, 5678 CD Havenstad');
    expect(mail.text).not.toContain('Teststraat 1');
  });

  it('falls back to the standaardadres when deliveryAddress is null (nullable DB column, not just empty string)', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [
        klant({ deliveryAddress: null as unknown as string, deliveryPostcode: null as unknown as string, deliveryCity: null as unknown as string }),
      ],
    });
    expect(mail.text).toContain('Afleveradres: Teststraat 1, 1234 AB Teststad');
  });

  it('groups multiple bestellingen from the same klant into a single section', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({ id: 'header-1' }),
        bestelling({
          id: 'header-2',
          lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text.match(/== Testbedrijf BV ==/g)).toHaveLength(1);
    expect(mail.text).toContain('aantal 2');
    expect(mail.text).toContain('aantal 1');
  });

  it('creates a section per klant when bestellingen come from different klanten', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling({ id: 'header-1' }), bestelling({ id: 'header-2', klantId: 'uid-2', companyName: 'Ander Bedrijf' })],
      klanten: [klant(), klant({ id: 'uid-2', companyName: 'Ander Bedrijf' })],
    });
    expect(mail.text).toContain('== Testbedrijf BV ==');
    expect(mail.text).toContain('== Ander Bedrijf ==');
  });

  it('describes a custom-size line using its breedte/hoogte instead of a maat lookup', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: 275, quantity: 1 },
          ],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('maat 90×140 cm');
  });

  it('appends the formaat suffix on a custom-size (breedte/hoogte) line too', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-6', kunstwerkId: 'kw-2', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: 275, quantity: 1 },
          ],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('maat 90×140 cm (Liggend), aantal 1');
  });

  it('sets a subject mentioning the drukker order', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.subject).toContain('Nieuwe order(s) voor de drukker');
  });

  it('appends " (Liggend)" to the maat when the kunstwerk formaat is liggend', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [{ id: 'line-4', kunstwerkId: 'kw-2', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('maat 40×60 cm (Liggend), aantal 1');
  });

  it('appends " (Staand)" to the maat when the kunstwerk formaat is staand', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [{ id: 'line-5', kunstwerkId: 'kw-3', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('maat 40×60 cm (Staand), aantal 1');
  });

  it('adds no suffix when the kunstwerk formaat is vierkant or not set', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.text).toContain('maat 40×60 cm, aantal 2');
    expect(mail.text).not.toContain('cm (');
  });

  it('falls back to the bestelling companyName and "Onbekend afleveradres" when the klant is not found', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling({ klantId: 'uid-missing', companyName: 'Verdwenen BV' })],
      klanten: [],
    });
    expect(mail.text).toContain('== Verdwenen BV ==');
    expect(mail.text).toContain('Afleveradres: Onbekend afleveradres');
  });

  it('falls back to "Onbekend materiaal", "Onbekend kunstwerk" and "Onbekende maat" for unmatched reference ids', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-unknown', kunstwerkId: 'kw-missing', maatId: 'maat-missing', materiaalId: 'mat-missing', prijs: 100, quantity: 1 },
          ],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('Onbekend kunstwerk');
    expect(mail.text).toContain('Onbekend materiaal');
    expect(mail.text).toContain('Onbekende maat');
  });

  it('includes an <img> for a line whose kunstwerk has a foto, in the html output', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      kunstwerken: [{ ...KUNSTWERKEN[0], foto: 'https://example.com/foto.jpg' }, KUNSTWERKEN[1], KUNSTWERKEN[2]],
    });
    expect(mail.html).toContain('<img src="https://example.com/foto.jpg"');
  });

  it('shows a "?" placeholder in the html output when a line\'s kunstwerk has no foto', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.html).not.toContain('<img src=""');
    expect(mail.html).toContain('>?<');
  });

  it('includes the maat and aantal but no price figures in the html output', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.html).toContain('Maat: 40×60 cm');
    expect(mail.html).toContain('Aantal: 2');
    expect(mail.html).not.toContain('€150');
    expect(mail.html).not.toContain('150,00');
  });

  it('HTML-escapes a bedrijfsnaam containing special characters', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant({ companyName: 'A & B <Glas>' })],
    });
    expect(mail.html).toContain('A &amp; B &lt;Glas&gt;');
    expect(mail.html).not.toContain('A & B <Glas>');
  });

  it('appends a one-time factuurvoetje with the Glassart & Design invoice details, after the klant sections', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });

    expect(mail.text).toContain('Glassart & Design');
    expect(mail.text).toContain(BEDRIJFSGEGEVENS_SEED.bezoekadres);
    expect(mail.text).toContain(`KVK-nummer: ${BEDRIJFSGEGEVENS_SEED.kvkNummer}`);
    expect(mail.text).toContain(`Btw-nummer: ${BEDRIJFSGEGEVENS_SEED.btwNummer}`);
    expect(mail.text).toContain(`E-mailadres (voor facturen): ${BEDRIJFSGEGEVENS_SEED.email}`);
    expect(mail.text.indexOf('Testbedrijf BV')).toBeLessThan(mail.text.indexOf('Glassart & Design'));

    expect(mail.html).toContain('Glassart &amp; Design');
    expect(mail.html).toContain(BEDRIJFSGEGEVENS_SEED.bezoekadres);
    expect(mail.html).toContain(`KVK-nummer: ${BEDRIJFSGEGEVENS_SEED.kvkNummer}`);
    expect(mail.html).toContain(`Btw-nummer: ${BEDRIJFSGEGEVENS_SEED.btwNummer}`);
    expect(mail.html).toContain(`E-mailadres (voor facturen): ${BEDRIJFSGEGEVENS_SEED.email}`);
    expect(mail.html.indexOf('Testbedrijf BV')).toBeLessThan(mail.html.indexOf('Glassart &amp; Design'));
  });

  it('includes the factuurvoetje only once, even with multiple klant sections', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling({ id: 'header-1' }), bestelling({ id: 'header-2', klantId: 'uid-2', companyName: 'Ander Bedrijf' })],
      klanten: [klant(), klant({ id: 'uid-2', companyName: 'Ander Bedrijf' })],
    });
    expect(mail.text.match(/Glassart & Design/g)).toHaveLength(1);
    expect(mail.html.match(/Glassart &amp; Design/g)).toHaveLength(1);
  });

  it('HTML-escapes the bedrijfsgegevens values in the factuurvoetje', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      bedrijfsgegevens: { ...BEDRIJFSGEGEVENS_SEED, bezoekadres: 'Kade & Haven 1, 1000 AB "Rotterdam"' },
    });
    expect(mail.html).toContain('Kade &amp; Haven 1, 1000 AB &quot;Rotterdam&quot;');
  });
});
