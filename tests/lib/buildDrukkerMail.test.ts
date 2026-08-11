import { describe, expect, it } from 'vitest';
import { buildDrukkerMail, ontbrekendeFactuurvoetjeVelden, ontbrekendeKlantVelden } from '@/lib/buildDrukkerMail';
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
    klantnr: 'KN-1',
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
    kunstenaarnr: null,
    ...overrides,
  };
}

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: '',
    code: 'Hotel paneel',
    kunstenaarnr: null,
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
    code: 'Raampaneel',
    kunstenaarnr: null,
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
    code: 'Deurpaneel',
    kunstenaarnr: null,
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
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijvingNl: 'Helder', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijvingNl: 'Glas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];

function bestelling(overrides: Partial<Bestelling> = {}): Bestelling {
  return {
    id: 'header-1',
    klantnr: 'KN-1',
    companyName: 'Testbedrijf BV',
    bestelnr: 'GD-00401',
    besteldatum: '1-7-2026',
    status: 'Te versturen naar drukker',
    lineCount: 1,
    totalQuantity: 2,
    lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
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
    // De klant wordt nu gevonden via klantnr, hetzelfde veld als de weergegeven
    // klantnummer-suffix -- een gevonden klant heeft dus altijd een zichtbaar nummer,
    // anders dan vroeger (matching via UUID, klantnr los daarvan optioneel).
    expect(mail.text).toContain('== Testbedrijf BV (KN-1) ==');
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
          lines: [{ id: 'line-2', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text.match(/== Testbedrijf BV \(KN-1\) ==/g)).toHaveLength(1);
    expect(mail.text).toContain('aantal 2');
    expect(mail.text).toContain('aantal 1');
  });

  it('creates a section per klant when bestellingen come from different klanten', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling({ id: 'header-1' }), bestelling({ id: 'header-2', klantnr: 'KN-2', companyName: 'Ander Bedrijf' })],
      klanten: [klant(), klant({ id: 'uid-2', klantnr: 'KN-2', companyName: 'Ander Bedrijf' })],
    });
    expect(mail.text).toContain('== Testbedrijf BV (KN-1) ==');
    expect(mail.text).toContain('== Ander Bedrijf (KN-2) ==');
  });

  it('describes a custom-size line using its breedte/hoogte instead of a maat lookup', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-3', code: 'Hotel paneel', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: 275, quantity: 1 },
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
            { id: 'line-6', code: 'Raampaneel', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: 275, quantity: 1 },
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

  it('shows a "Bestelling {bestelnr}" heading before that bestelling\'s regels, even with a single bestelling per klant', () => {
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [klant()] });
    expect(mail.text).toContain('Bestelling GD-00401:');
    expect(mail.html).toContain('Bestelling GD-00401');
  });

  it('shows a separate heading per bestelling, in order, when a klant has multiple bestellingen', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({ id: 'header-1', bestelnr: 'GD-00401' }),
        bestelling({
          id: 'header-2',
          bestelnr: 'GD-00402',
          lines: [{ id: 'line-2', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        }),
      ],
      klanten: [klant()],
    });
    const eersteKopje = mail.text.indexOf('Bestelling GD-00401:');
    const tweedeKopje = mail.text.indexOf('Bestelling GD-00402:');
    expect(eersteKopje).toBeGreaterThanOrEqual(0);
    expect(tweedeKopje).toBeGreaterThan(eersteKopje);
    expect(mail.text.indexOf('aantal 2')).toBeLessThan(tweedeKopje);
    expect(mail.text.indexOf('aantal 1')).toBeGreaterThan(tweedeKopje);
  });

  it('appends " (Liggend)" to the maat when the kunstwerk formaat is liggend', () => {
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [{ id: 'line-4', code: 'Raampaneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
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
          lines: [{ id: 'line-5', code: 'Deurpaneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
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
      bestellingen: [bestelling({ klantnr: 'KN-MISSING', companyName: 'Verdwenen BV' })],
      klanten: [],
    });
    expect(mail.text).toContain('== Verdwenen BV ==');
    expect(mail.text).toContain('Afleveradres: Onbekend afleveradres');
  });

  it('falls back to "Onbekend materiaal" and "Onbekende maat" for unmatched reference ids, but shows the regel\'s own code even when no kunstwerk matches it', () => {
    // De code staat op de bestelregel zelf en komt dus altijd mee, ook als het
    // kunstwerk waar hij ooit bij hoorde uit de catalogus is verdwenen -- in
    // tegenstelling tot materiaal en maat, die nog wél via een id worden
    // opgezocht en dus een "Onbekend(e) ..." fallback kunnen tonen.
    const mail = callBuildDrukkerMail({
      bestellingen: [
        bestelling({
          lines: [
            { id: 'line-unknown', code: 'kw-missing', maatId: 'maat-missing', materiaalId: 'mat-missing', prijs: 100, quantity: 1 },
          ],
        }),
      ],
      klanten: [klant()],
    });
    expect(mail.text).toContain('kw-missing');
    expect(mail.text).not.toContain('Onbekend kunstwerk');
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

  it('zet het klantnummer achter de bedrijfsnaam in tekst en HTML', () => {
    const mail = callBuildDrukkerMail({
      // De klant wordt gevonden via klantnr, dus de bestelling moet hetzelfde
      // klantnr dragen als de klant hieronder om te matchen.
      bestellingen: [bestelling({ klantnr: 'KL-00003' })],
      klanten: [klant({ klantnr: 'KL-00003' })],
    });
    expect(mail.text).toContain('== Testbedrijf BV (KL-00003) ==');
    expect(mail.html).toContain('Testbedrijf BV (KL-00003)');
  });

  it('laat de kop ongewijzigd wanneer de klant niet gevonden wordt', () => {
    // Sinds taak 2 wordt de klant gevonden via hetzelfde klantnr-veld dat ook de
    // suffix levert -- een gevonden klant heeft dus altijd een zichtbaar nummer.
    // "Geen klantnummer" is daarmee gelijk geworden aan "klant niet gevonden"
    // (zie ook de aparte test daarvoor hieronder): hier met een klant wiens
    // klantnr niet overeenkomt met de bestelling, zodat de match faalt.
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant({ klantnr: 'een-ander-klantnr' })],
    });
    expect(mail.text).toContain('== Testbedrijf BV ==');
    // Bewust op de kop zelf, niet op '(' in het algemeen: het factuurvoetje bevat
    // al "E-mailadres (voor facturen)".
    expect(mail.text).not.toContain('Testbedrijf BV (');
  });

  it('blokkeert het versturen niet wanneer het klantnummer ontbreekt', () => {
    expect(ontbrekendeKlantVelden(klant({ klantnr: null }))).toEqual([]);
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
      bestellingen: [bestelling({ id: 'header-1' }), bestelling({ id: 'header-2', klantnr: 'KN-2', companyName: 'Ander Bedrijf' })],
      klanten: [klant(), klant({ id: 'uid-2', klantnr: 'KN-2', companyName: 'Ander Bedrijf' })],
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

describe('ontbrekendeFactuurvoetjeVelden', () => {
  it('reports nothing for a complete record', () => {
    expect(ontbrekendeFactuurvoetjeVelden(BEDRIJFSGEGEVENS_SEED)).toEqual([]);
  });

  it('names every field the factuurvoetje needs but does not have', () => {
    // De data komt als losse JSON-blob uit `instellingen` en wordt nergens
    // gevalideerd, dus het Bedrijfsgegevens-type liegt hier over runtime:
    // ontbrekende velden zijn undefined terwijl het type "string" belooft.
    const onvolledig = { ...BEDRIJFSGEGEVENS_SEED, kvkNummer: undefined, email: undefined } as unknown as Bedrijfsgegevens;
    expect(ontbrekendeFactuurvoetjeVelden(onvolledig).sort()).toEqual(['email', 'kvkNummer']);
  });

  it('treats a blank or whitespace-only value as missing', () => {
    const leeg = { ...BEDRIJFSGEGEVENS_SEED, bezoekadres: '   ' } as Bedrijfsgegevens;
    expect(ontbrekendeFactuurvoetjeVelden(leeg)).toEqual(['bezoekadres']);
  });

  it('reports nothing when the record itself is absent, because that case is already handled separately', () => {
    expect(ontbrekendeFactuurvoetjeVelden(null)).toEqual([]);
  });
});

describe('buildDrukkerMail robustness', () => {
  it('never throws on an incomplete record, so one missing field cannot take down the screen that renders it', () => {
    // VersturenNaarDrukkerDialog is altijd gemount in het bestellingenscherm.
    // Gooide dit, dan verdween niet de dialoog maar het hele scherm.
    const onvolledig = { ...BEDRIJFSGEGEVENS_SEED, bezoekadres: undefined, btwNummer: undefined } as unknown as Bedrijfsgegevens;
    const mail = callBuildDrukkerMail({
      bestellingen: [bestelling()],
      klanten: [klant()],
      bedrijfsgegevens: onvolledig,
    });
    expect(mail.html).toContain('KVK-nummer: 12345678');
    expect(mail.html).not.toContain('undefined');
    expect(mail.text).not.toContain('undefined');
  });
});

describe('ontbrekendeKlantVelden', () => {
  it('reports nothing for a klant with a complete main address', () => {
    expect(ontbrekendeKlantVelden(klant())).toEqual([]);
  });

  it('reports nothing for a klant with a complete delivery address', () => {
    const metAfleveradres = klant({
      deliveryAddress: 'Havenweg 5',
      deliveryPostcode: '5678 CD',
      deliveryCity: 'Havenstad',
    });
    expect(ontbrekendeKlantVelden(metAfleveradres)).toEqual([]);
  });

  it('names the missing main-address fields', () => {
    // Deze kolommen zijn NULLABLE in db/schema.sql terwijl Klant ze als
    // verplichte string typeert -- op runtime dus gewoon null.
    const zonderAdres = { ...klant(), address: null, city: null } as unknown as Klant;
    expect([...ontbrekendeKlantVelden(zonderAdres)].sort()).toEqual(['address', 'city']);
  });

  it('checks the delivery fields instead of the main ones once a delivery address is filled in', () => {
    const halfAfleveradres = klant({ deliveryAddress: 'Havenweg 5' });
    expect([...ontbrekendeKlantVelden(halfAfleveradres)].sort()).toEqual(['deliveryCity', 'deliveryPostcode']);
  });

  it('reports a missing bedrijfsnaam', () => {
    const naamloos = { ...klant(), companyName: '   ' } as Klant;
    expect(ontbrekendeKlantVelden(naamloos)).toEqual(['companyName']);
  });

  it('reports nothing when the klant record itself is absent, because that case is handled separately', () => {
    expect(ontbrekendeKlantVelden(null)).toEqual([]);
  });
});

describe('buildDrukkerMail klant robustness', () => {
  it('never writes a literal null into the mail when address columns are empty', () => {
    // Voorheen leverde dit "Afleveradres: null, null null" op in de tekstmail,
    // terwijl de HTML-variant via escapeHtml juist leeg bleef -- twee
    // verschillende uitkomsten voor dezelfde data.
    const zonderAdres = { ...klant(), address: null, postcode: null, city: null } as unknown as Klant;
    const mail = callBuildDrukkerMail({ bestellingen: [bestelling()], klanten: [zonderAdres] });
    expect(mail.text).not.toContain('null');
    expect(mail.html).not.toContain('null');
    expect(mail.text).not.toContain('undefined');
  });
});
