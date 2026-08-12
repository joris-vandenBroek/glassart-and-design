import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BestellingenSection, type Bestelling } from '@/components/beheer/BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort, Drukker } from '@/components/beheer/materiaalTypes';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';
import messages from '../../../messages/nl.json';

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

const fetchMock = vi.fn();

// VersturenNaarDrukkerDialog is altijd gemount (ook wanneer hij dicht is) en
// bouwt de drukkersmail in een useMemo die de bedrijfsgegevens nodig heeft.
// Een test die de fetch-mock vervangt en die route vergeet, laat daardoor niet
// alleen de dialoog maar de hele sectie crashen op escapeHtml(undefined).
// Daarom wordt die ene route hier centraal afgevangen, vóór fetchMock -- zo
// hoeft geen enkele losse mockImplementation eraan te denken. De respons is
// per test overschrijfbaar, zodat een test die juist een onvolledig record wil
// onderzoeken niet op dit vangnet vastloopt.
let bedrijfsgegevensRespons: unknown = BEDRIJFSGEGEVENS_SEED;

vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
  if (url === '/api/instellingen/bedrijfsgegevens') {
    return Promise.resolve({ ok: true, json: async () => bedrijfsgegevensRespons });
  }
  return fetchMock(url, init);
});

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: vi.fn(),}));

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
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
];
const MATERIALEN: Materiaal[] = [
  {
    id: 'mat-1',
    materiaalsoortId: 'soort-1',
    materiaaldikte: 4,
    omschrijvingNl: 'Veiligheidsglas',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];

const KLANTEN: Klant[] = [
  {
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
  },
];

const DRUKKERS: Drukker[] = [
  { id: 'drukker-1', drukkernr: 'DR-00003', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
];

const BESTELLINGEN: Bestelling[] = [
  {
    id: 'header-1',
    klantnr: 'KN-1',
    companyName: 'Testbedrijf BV',
    bestelnr: 'GD-00301',
    korting: null,
    besteldatum: '1-7-2026',
    status: 'Te beoordelen',
    lineCount: 1,
    totalQuantity: 3,
    lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 }],
  },
  {
    id: 'header-2',
    klantnr: 'KN-2',
    companyName: 'Ander Bedrijf',
    bestelnr: 'GD-00302',
    korting: null,
    besteldatum: '2-7-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [{ id: 'line-2', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof BestellingenSection>> = {}) {
  const onBestellingUpdated = vi.fn();

  function element(props: Partial<React.ComponentProps<typeof BestellingenSection>>) {
    return (
      <NextIntlClientProvider locale="nl" messages={messages}>
        <BestellingenSection
          bestellingen={BESTELLINGEN}
          kunstwerken={KUNSTWERKEN}
          materialen={MATERIALEN}
          maten={MATEN}
          materiaalsoorten={MATERIAALSOORTEN}
          klanten={KLANTEN}
          btwTarieven={null}
          bestelinstellingen={null}
          drukkers={DRUKKERS}
          loadError={null}
          onBestellingUpdated={onBestellingUpdated}
          {...props}
        />
      </NextIntlClientProvider>
    );
  }

  const { rerender: rtlRerender } = render(element(overrides));
  function rerender(bestellingen: Bestelling[]) {
    rtlRerender(element({ bestellingen }));
  }
  return { onBestellingUpdated, rerender };
}

beforeEach(() => {
  fetchMock.mockReset();
  bedrijfsgegevensRespons = BEDRIJFSGEGEVENS_SEED;
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe('BestellingenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('bestellingen-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while bestellingen is null and there is no error', () => {
    renderSection({ bestellingen: null });
    expect(screen.queryByTestId('bestellingen-section')).not.toBeInTheDocument();
  });

  it('shows all bestellingen by default (status filter defaults to "alle bestellingen")', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-2')).toBeInTheDocument();
  });

  it('shows the bestelnummer in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-header-1')).toHaveTextContent('GD-00301');
    expect(screen.getByTestId('data-table-row-header-2')).toHaveTextContent('GD-00302');
  });

  it('sorts on bestelnummer descending by default, so the newest bestelling is on top', () => {
    renderSection();
    const rowOrder = screen.getAllByTestId(/^data-table-row-/).map((row) => row.getAttribute('data-testid'));
    expect(rowOrder).toEqual(['data-table-row-header-2', 'data-table-row-header-1']);
  });

  it('shows the zendingnummer once a bestelling has been sent, and nothing before that', () => {
    renderSection({
      bestellingen: [BESTELLINGEN[0], { ...BESTELLINGEN[1], zendingnummer: 'ZD-00007' }],
    });
    expect(screen.getByTestId('data-table-row-header-2')).toHaveTextContent('ZD-00007');
    expect(screen.getByTestId('data-table-row-header-1')).not.toHaveTextContent('ZD-');
  });

  it('copies the zendingnummer to the clipboard without opening the bestelling, when the copy button is clicked', () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    renderSection({
      bestellingen: [BESTELLINGEN[0], { ...BESTELLINGEN[1], zendingnummer: 'ZD-00007' }],
    });
    fireEvent.click(screen.getByTestId('bestellingen-zendingnummer-kopieren-header-2'));
    expect(writeText).toHaveBeenCalledWith('ZD-00007');
    expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument();
  });

  it('shows only the "Te versturen naar drukker" bestelling after clicking that quick filter link', () => {
    const bestellingen = [
      { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const },
      BESTELLINGEN[1],
    ];
    renderSection({ bestellingen });
    fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-header-2')).not.toBeInTheDocument();
  });

  it("opens the BestellingModal with the clicked bestelling's resolved kunstwerk data when a row is clicked", () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('bestelling-modal')).toHaveTextContent('Hotel paneel');
  });

  it('closes the modal and reports the updated bestelling via onBestellingUpdated after approving', async () => {
    const { onBestellingUpdated } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));

    await waitFor(() =>
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' })
    );
    await waitFor(() => expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument());
  });

  describe('bulk selection', () => {
    const TE_VERSTUREN = { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const };

    it('shows no selection column while the "alle bestellingen" filter is active', () => {
      renderSection({ bestellingen: [TE_VERSTUREN, BESTELLINGEN[1]] });
      expect(screen.queryByTestId('data-table-select-all')).not.toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-header-1')).not.toBeInTheDocument();
    });

    it('shows checkboxes for every row once the "te versturen" filter is active', () => {
      renderSection({ bestellingen: [TE_VERSTUREN, BESTELLINGEN[1]] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      expect(screen.getByTestId('data-table-row-select-header-1')).toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-header-2')).not.toBeInTheDocument();
    });

    it('shows checkboxes once the "verstuurd naar drukker" filter is active', () => {
      renderSection({ bestellingen: [TE_VERSTUREN, BESTELLINGEN[1]] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      expect(screen.getByTestId('data-table-row-select-header-2')).toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-header-1')).not.toBeInTheDocument();
    });

    it('shows the selection bar with a count once a bestelling is selected, and hides it when deselected', () => {
      renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent('1 bestellingen geselecteerd (1 klanten)');
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('counts distinct klanten in the selection bar', () => {
      const bestellingen = [TE_VERSTUREN, { ...BESTELLINGEN[1], id: 'header-3', status: 'Te versturen naar drukker' as const }];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-3'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent('2 bestellingen geselecteerd (2 klanten)');
    });

    it('clears the selection when the filter changes', () => {
      renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('data-table-quick-alle'));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('never shows the "versturen naar drukker" button for a selection of already-verstuurde bestellingen right after switching filters', () => {
      // header-2 is "Verstuurd naar drukker". Select it under that filter,
      // then switch straight to "te versturen". The render must never show
      // the "Versturen naar drukker" button for this (stale, already-sent)
      // selection -- clicking it would resend an already-verstuurde
      // bestelling to the drukker. The component must not rely on raw
      // `selectedIds` (only cleaned up by a later effect) but on a value
      // derived directly in the render itself.
      //
      // Note: in this jsdom/RTL setup, both fireEvent.click (which wraps
      // dispatch in act()) and a raw DOM .click() end up flushing the
      // selectedIds-cleanup effect synchronously before any assertion can
      // run, so this specific test does not actually fail against the
      // pre-fix (effect-only) implementation -- it documents and guards the
      // derived-value approach rather than proving the one-render lag via a
      // red/green cycle. See the eindreview-fixes report for the fuller
      // explanation.
      renderSection({ bestellingen: [BESTELLINGEN[1]] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      expect(screen.getByTestId('bestellingen-afronden')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));

      expect(screen.queryByTestId('bestellingen-versturen-naar-drukker')).not.toBeInTheDocument();
    });

    it('clears the selection when the underlying bestelling no longer has the filtered status', () => {
      const { rerender } = renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toBeInTheDocument();
      rerender([{ ...TE_VERSTUREN, status: 'Verstuurd naar drukker' as const }]);
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('shows the "versturen naar drukker" button under the "te versturen" filter', () => {
      renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-versturen-naar-drukker')).toBeInTheDocument();
      expect(screen.queryByTestId('bestellingen-afronden')).not.toBeInTheDocument();
    });

    it('shows the "afronden" button under the "verstuurd naar drukker" filter', () => {
      renderSection({ bestellingen: [BESTELLINGEN[1]] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      expect(screen.getByTestId('bestellingen-afronden')).toHaveTextContent('Afronden');
      expect(screen.queryByTestId('bestellingen-versturen-naar-drukker')).not.toBeInTheDocument();
    });

    it('opens the VersturenNaarDrukkerDialog with only the selected bestellingen when the button is clicked', async () => {
      const bestellingen = [TE_VERSTUREN, { ...BESTELLINGEN[1], id: 'header-3', status: 'Te versturen naar drukker' as const }];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.queryByTestId('drukker-versturen-drukker')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('bestellingen-versturen-naar-drukker'));

      expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
      await waitFor(() => expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV'));
      expect(screen.getByTestId('drukker-versturen-preview')).not.toHaveTextContent('Ander Bedrijf');
    });

    it('reports each verstuurde bestelling, clears the selection, and closes the dialog on a successful send', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url === '/api/drukkers/drukker-1/zendingen/nummer') {
          return Promise.resolve({ ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const { onBestellingUpdated } = renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      fireEvent.click(screen.getByTestId('bestellingen-versturen-naar-drukker'));

      await waitFor(() => expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV'));
      fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

      await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalled());
      expect(onBestellingUpdated.mock.calls[0][0]).toEqual({
        ...TE_VERSTUREN,
        status: 'Verstuurd naar drukker',
        zendingnummer: 'ZD-00001',
      });
      expect(screen.queryByTestId('drukker-versturen-drukker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });
  });

  describe('factureren (Te factureren -> Betaald en afgerond)', () => {
    const TE_FACTUREREN = { ...BESTELLINGEN[1], status: 'Te factureren' as const };
    const BETAALD_EN_AFGEROND = { ...BESTELLINGEN[1], status: 'Betaald en afgerond' as const };

    it('shows the new quick-filter options alongside the existing ones', () => {
      renderSection();
      expect(screen.getByTestId('data-table-quick-te-versturen')).toBeInTheDocument();
      expect(screen.getByTestId('data-table-quick-verstuurd')).toBeInTheDocument();
      expect(screen.getByTestId('data-table-quick-te-factureren')).toHaveTextContent('Te factureren');
      expect(screen.getByTestId('data-table-quick-betaald-en-afgerond')).toHaveTextContent(
        'Betaald en afgerond'
      );
      expect(screen.getByTestId('data-table-quick-alle')).toBeInTheDocument();
    });

    it('shows the "Betaald en afgerond melden" bulk action under the "Te factureren" filter and PATCHes each selected bestelling without the zendinggenoten dialog', async () => {
      const { onBestellingUpdated } = renderSection({ bestellingen: [TE_FACTUREREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-factureren'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      expect(screen.getByTestId('bestellingen-factureren')).toHaveTextContent(
        'Betaald en afgerond melden'
      );
      expect(screen.queryByTestId('bestellingen-afronden')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('bestellingen-factureren'));

      await waitFor(() =>
        expect(onBestellingUpdated).toHaveBeenCalledWith({
          ...TE_FACTUREREN,
          status: 'Betaald en afgerond',
        })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-2',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'Betaald en afgerond' }),
        })
      );
      const zendingLookupCalls = fetchMock.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.startsWith('/api/drukkerzendingen')
      );
      expect(zendingLookupCalls).toHaveLength(0);
      expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('shows no selection bar / bulk action under the "Betaald en afgerond" filter', () => {
      renderSection({ bestellingen: [BETAALD_EN_AFGEROND] });
      fireEvent.click(screen.getByTestId('data-table-quick-betaald-en-afgerond'));
      expect(screen.queryByTestId('data-table-row-select-header-2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('reports a failed PATCH instead of silently swallowing it, and keeps the selection intact', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.startsWith('/api/bestelheaders/')) {
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const { onBestellingUpdated } = renderSection({ bestellingen: [TE_FACTUREREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-factureren'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-factureren'));

      await waitFor(() => expect(screen.getByTestId('bestellingen-afronden-fout')).toBeInTheDocument());
      expect(onBestellingUpdated).not.toHaveBeenCalled();
      expect(screen.getByTestId('bestellingen-selectie-balk')).toBeInTheDocument();
      expect(screen.getByTestId('data-table-row-select-header-2')).toBeChecked();
    });
  });

  describe('afronden', () => {
    const VERSTUURD = BESTELLINGEN[1];

    function mockLookup(zendingen: unknown[]) {
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
          return Promise.resolve({ ok: true, json: async () => zendingen });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    }

    it('rondt direct af zonder dialoog wanneer er geen openstaande zendinggenoten zijn', async () => {
      mockLookup([]);
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() =>
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Te factureren' })
      );
      expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();
    });

    it('toont de dialoog met de openstaande genoot en rondt bij "alleen deze" alleen de selectie af', async () => {
      const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
      mockLookup([
        {
          id: 'z1',
          drukkernr: 'DR-00003',
          drukkerNaam: 'Drukkerij Janssen',
          verzondenOp: '2026-08-03T10:00:00Z',
          bestellingIds: ['GD-00302', 'GD-00309'],
        },
      ]);
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD, genoot] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
      expect(screen.getByTestId('afronden-bevestiging')).toHaveTextContent('GD-00309');

      fireEvent.click(screen.getByTestId('afronden-bevestiging-alleen-deze'));

      await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(1));
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Te factureren' });
    });

    it('rondt bij "ook deze" de selectie én de genoten af', async () => {
      const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
      mockLookup([
        {
          id: 'z1',
          drukkernr: 'DR-00003',
          drukkerNaam: 'Drukkerij Janssen',
          verzondenOp: '2026-08-03T10:00:00Z',
          bestellingIds: ['GD-00302', 'GD-00309'],
        },
      ]);
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD, genoot] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('afronden-bevestiging-ook-deze'));

      await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(2));
      const afgerondeIds = onBestellingUpdated.mock.calls.map((call) => call[0].id).sort();
      expect(afgerondeIds).toEqual(['header-2', 'header-9']);
    });

    it('rondt gewoon af wanneer de zending-lookup faalt', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
          return Promise.resolve({ ok: false, json: async () => ({}) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() =>
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Te factureren' })
      );
      expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();
    });

    it('meldt hoeveel bestellingen niet konden worden afgerond', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (typeof url === 'string' && url.startsWith('/api/bestelheaders/')) {
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() => expect(screen.getByTestId('bestellingen-afronden-fout')).toBeInTheDocument());
      expect(onBestellingUpdated).not.toHaveBeenCalled();
    });

    it('rondt een losse bestelling af via de modal en sluit die', async () => {
      mockLookup([]);
      const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD] });
      fireEvent.click(screen.getByTestId('data-table-row-header-2'));
      fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

      await waitFor(() =>
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Te factureren' })
      );
      await waitFor(() => expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument());
    });

    it('laat een bestaande selectie ongemoeid wanneer een andere bestelling los via de modal wordt afgerond', async () => {
      // Filter op "Verstuurd naar drukker", vink drie bestellingen aan, klik
      // dan op een vierde rij en rond die af via de modal. Alleen die vierde
      // hoort te worden afgerond -- de drie vinkjes mogen niet verdwijnen.
      mockLookup([]);
      const genoot3 = { ...VERSTUURD, id: 'header-3', bestelnr: 'GD-00303' };
      const genoot4 = { ...VERSTUURD, id: 'header-4', bestelnr: 'GD-00304' };
      const losseVierde = { ...VERSTUURD, id: 'header-5', bestelnr: 'GD-00305' };
      const { onBestellingUpdated } = renderSection({
        bestellingen: [VERSTUURD, genoot3, genoot4, losseVierde],
      });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-3'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-4'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent(
        '3 bestellingen geselecteerd'
      );

      fireEvent.click(screen.getByTestId('data-table-row-header-5'));
      fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

      await waitFor(() =>
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...losseVierde, status: 'Te factureren' })
      );
      expect(onBestellingUpdated).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent(
        '3 bestellingen geselecteerd'
      );
      expect(screen.getByTestId('data-table-row-select-header-2')).toBeChecked();
      expect(screen.getByTestId('data-table-row-select-header-3')).toBeChecked();
      expect(screen.getByTestId('data-table-row-select-header-4')).toBeChecked();
    });

    it('schakelt de bulkknop uit terwijl de bevestigingsdialoog op een keuze wacht', async () => {
      // Zodra de lookup klaar is en de dialoog getoond wordt, staat afrondBezig
      // alweer op false (zie startAfronden) -- de bulkknop moet dan toch net
      // zo uitgeschakeld zijn als de losse modal-knop, anders kan de
      // medewerker via de bulkknop een nieuwe (stilzwijgend geweigerde) ronde
      // proberen te starten terwijl deze dialoog nog open staat.
      const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
      mockLookup([
        {
          id: 'z1',
          drukkernr: 'DR-00003',
          drukkerNaam: 'Drukkerij Janssen',
          verzondenOp: '2026-08-03T10:00:00Z',
          bestellingIds: ['GD-00302', 'GD-00309'],
        },
      ]);
      renderSection({ bestellingen: [VERSTUURD, genoot] });
      fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
      fireEvent.click(screen.getByTestId('bestellingen-afronden'));

      await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
      expect(screen.getByTestId('bestellingen-afronden')).toBeDisabled();
    });

    describe('bescherming tegen dubbel klikken', () => {
      it('schakelt de bulkknop uit tijdens het afronden zodat een tweede klik geen extra PATCH-ronde start', async () => {
        let resolvePatch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
        const patchPromise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
          resolvePatch = resolve;
        });
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
          if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
            return Promise.resolve({ ok: true, json: async () => [] });
          }
          if (
            typeof url === 'string' &&
            url.startsWith('/api/bestelheaders/') &&
            init?.method === 'PATCH'
          ) {
            return patchPromise;
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD] });
        fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
        fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        await waitFor(() => expect(screen.getByTestId('bestellingen-afronden')).toBeDisabled());

        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        const patchCalls = fetchMock.mock.calls.filter(
          ([url, init]) =>
            typeof url === 'string' &&
            url.startsWith('/api/bestelheaders/') &&
            (init as RequestInit | undefined)?.method === 'PATCH'
        );
        expect(patchCalls).toHaveLength(1);

        resolvePatch({ ok: true, json: async () => ({}) });

        await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(1));
      });

      it('schakelt de knoppen van de bevestigingsdialoog uit tijdens het afronden zodat een tweede klik op "Alleen deze afronden" geen extra ronde start', async () => {
        const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
        let resolvePatch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
        const patchPromise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
          resolvePatch = resolve;
        });
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
          if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
            return Promise.resolve({
              ok: true,
              json: async () => [
                {
                  id: 'z1',
                  drukkernr: 'DR-00003',
                  drukkerNaam: 'Drukkerij Janssen',
                  verzondenOp: '2026-08-03T10:00:00Z',
                  bestellingIds: ['GD-00302', 'GD-00309'],
                },
              ],
            });
          }
          if (
            typeof url === 'string' &&
            url.startsWith('/api/bestelheaders/') &&
            init?.method === 'PATCH'
          ) {
            return patchPromise;
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD, genoot] });
        fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
        fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('afronden-bevestiging-alleen-deze'));

        await waitFor(() =>
          expect(screen.getByTestId('afronden-bevestiging-alleen-deze')).toBeDisabled()
        );
        expect(screen.getByTestId('afronden-bevestiging-ook-deze')).toBeDisabled();
        expect(screen.getByTestId('afronden-bevestiging-annuleren')).toBeDisabled();

        fireEvent.click(screen.getByTestId('afronden-bevestiging-alleen-deze'));

        const patchCalls = fetchMock.mock.calls.filter(
          ([url, init]) =>
            typeof url === 'string' &&
            url.startsWith('/api/bestelheaders/') &&
            (init as RequestInit | undefined)?.method === 'PATCH'
        );
        expect(patchCalls).toHaveLength(1);

        resolvePatch({ ok: true, json: async () => ({}) });

        await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(1));
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Te factureren' });
      });

      it('schakelt ook de "Afronden"-knop in de modal uit tijdens een bulkronde, zodat een tweede aanroep via die knop geen extra PATCH-ronde start', async () => {
        // Derde ingang naar startAfronden naast de bulkknop en de dialoogknoppen:
        // de losse "Afronden"-knop in BestellingModal (bereikt door op een rij
        // te klikken). Die moet even goed op slot zitten tijdens een lopende
        // bulkronde voor een héél andere bestelling.
        const header5 = { ...BESTELLINGEN[1], id: 'header-5', bestelnr: 'GD-00305' };
        let resolvePatch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
        const patchPromise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
          resolvePatch = resolve;
        });
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
          if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
            return Promise.resolve({ ok: true, json: async () => [] });
          }
          if (
            typeof url === 'string' &&
            url.startsWith('/api/bestelheaders/') &&
            init?.method === 'PATCH'
          ) {
            return patchPromise;
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD, header5] });

        // Open eerst de modal voor header-5 -- de knop is nog gewoon bruikbaar.
        fireEvent.click(screen.getByTestId('data-table-row-header-5'));
        expect(screen.getByTestId('bestelling-modal-afronden')).not.toBeDisabled();

        // Start ondertussen een bulkronde voor header-2.
        fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
        fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        await waitFor(() => expect(screen.getByTestId('bestelling-modal-afronden')).toBeDisabled());

        fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

        const patchCalls = fetchMock.mock.calls.filter(
          ([url, init]) =>
            typeof url === 'string' &&
            url.startsWith('/api/bestelheaders/') &&
            (init as RequestInit | undefined)?.method === 'PATCH'
        );
        expect(patchCalls).toHaveLength(1);

        resolvePatch({ ok: true, json: async () => ({}) });

        await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(1));
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Te factureren' });
      });

      it('een openstaande bevestigingsdialoog wordt niet weggeklikt door een gelijktijdige tweede ronde via de modal-knop', async () => {
        // header-2's zendinggenoot-lookup levert een genoot op en toont de
        // bevestigingsdialoog. Zodra die open staat, probeert de medewerker
        // via de losse modal-knop een heel andere bestelling af te ronden
        // (header-5). Het dialoog-slot (afrondDialoogOpenRef) weigert die
        // tweede ronde meteen -- er wordt zelfs geen lookup of PATCH voor
        // header-5 gestart -- en de dialoog voor header-2 blijft ongemoeid
        // staan.
        const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
        const header5 = { ...BESTELLINGEN[1], id: 'header-5', bestelnr: 'GD-00305' };

        fetchMock.mockImplementation((url: string) => {
          if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
            if (url.includes('GD-00302')) {
              return Promise.resolve({
                ok: true,
                json: async () => [
                  {
                    id: 'z1',
                    drukkernr: 'DR-00003',
                    drukkerNaam: 'Drukkerij Janssen',
                    verzondenOp: '2026-08-03T10:00:00Z',
                    bestellingIds: ['GD-00302', 'GD-00309'],
                  },
                ],
              });
            }
            return Promise.resolve({ ok: true, json: async () => [] });
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD, genoot, header5] });
        fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
        fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
        expect(screen.getByTestId('afronden-bevestiging')).toHaveTextContent('GD-00309');

        fetchMock.mockClear();

        fireEvent.click(screen.getByTestId('data-table-row-header-5'));
        fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

        const header5ZendingCalls = fetchMock.mock.calls.filter(
          ([url]) => typeof url === 'string' && url.startsWith('/api/drukkerzendingen') && url.includes('GD-00305')
        );
        expect(header5ZendingCalls).toHaveLength(0);
        expect(onBestellingUpdated).not.toHaveBeenCalled();
        expect(screen.queryByTestId('bestellingen-afronden-fout')).not.toBeInTheDocument();

        // De dialoog voor header-2 staat nog gewoon open, ongemoeid door
        // header-5's geweigerde ronde.
        expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument();
        expect(screen.getByTestId('afronden-bevestiging')).toHaveTextContent('GD-00309');

        fireEvent.click(screen.getByTestId('afronden-bevestiging-annuleren'));

        expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();
        expect(screen.queryByTestId('bestellingen-afronden-fout')).not.toBeInTheDocument();
      });

      it('een openstaande bevestigingsdialoog wordt niet overschreven door een tweede ronde die zelf ook zendinggenoten heeft', async () => {
        // header-2 heeft genoot header-9 en toont de dialoog. Terwijl die nog
        // op een keuze wacht, probeert de medewerker via de modal-knop een
        // heel andere bestelling (header-5) af te ronden, die zélf ook een
        // openstaande genoot heeft (header-10). Zonder het extra dialoog-slot
        // zou startAfronden voor header-5 gewoon doorlopen en
        // afrondKandidaten/afrondGenoten overschrijven met header-5/header-10
        // -- de dialoog voor header-2/header-9 zou dan stilzwijgend verdwijnen.
        const genoot9 = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
        const header5 = { ...BESTELLINGEN[1], id: 'header-5', bestelnr: 'GD-00305' };
        const genoot10 = { ...BESTELLINGEN[1], id: 'header-10', bestelnr: 'GD-00310' };

        fetchMock.mockImplementation((url: string) => {
          if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
            if (url.includes('GD-00302')) {
              return Promise.resolve({
                ok: true,
                json: async () => [
                  {
                    id: 'z1',
                    drukkernr: 'DR-00003',
                    drukkerNaam: 'Drukkerij Janssen',
                    verzondenOp: '2026-08-03T10:00:00Z',
                    bestellingIds: ['GD-00302', 'GD-00309'],
                  },
                ],
              });
            }
            if (url.includes('GD-00305')) {
              return Promise.resolve({
                ok: true,
                json: async () => [
                  {
                    id: 'z2',
                    drukkernr: 'DR-00003',
                    drukkerNaam: 'Drukkerij Janssen',
                    verzondenOp: '2026-08-03T10:00:00Z',
                    bestellingIds: ['GD-00305', 'GD-00310'],
                  },
                ],
              });
            }
            return Promise.resolve({ ok: true, json: async () => [] });
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        renderSection({ bestellingen: [VERSTUURD, genoot9, header5, genoot10] });
        fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
        fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
        expect(screen.getByTestId('afronden-bevestiging')).toHaveTextContent('GD-00309');

        fetchMock.mockClear();

        fireEvent.click(screen.getByTestId('data-table-row-header-5'));
        fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

        // De tweede ronde mag zelfs niet aan de lookup beginnen -- startAfronden
        // hoort direct terug te keren zolang de dialoog nog op een keuze wacht.
        const header5ZendingCalls = fetchMock.mock.calls.filter(
          ([url]) => typeof url === 'string' && url.startsWith('/api/drukkerzendingen') && url.includes('GD-00305')
        );
        expect(header5ZendingCalls).toHaveLength(0);

        expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument();
        expect(screen.getByTestId('afronden-bevestiging')).toHaveTextContent('GD-00309');
        expect(screen.getByTestId('afronden-bevestiging')).not.toHaveTextContent('GD-00310');
      });

      it('kan na het annuleren van de dialoog gewoon een nieuwe ronde starten', async () => {
        // De belangrijkste test: het dialoog-slot mag nooit blijven hangen na
        // annuleren, anders is het scherm blijvend onbruikbaar.
        const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
        fetchMock.mockImplementation((url: string) => {
          if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
            return Promise.resolve({
              ok: true,
              json: async () => [
                {
                  id: 'z1',
                  drukkernr: 'DR-00003',
                  drukkerNaam: 'Drukkerij Janssen',
                  verzondenOp: '2026-08-03T10:00:00Z',
                  bestellingIds: ['GD-00302', 'GD-00309'],
                },
              ],
            });
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        const { onBestellingUpdated } = renderSection({ bestellingen: [VERSTUURD, genoot] });
        fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
        fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('afronden-bevestiging-annuleren'));
        expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('afronden-bevestiging-alleen-deze'));

        await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(1));
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Te factureren' });
      });
    });

    describe('afrondFout opruimen', () => {
      it('wist de foutmelding wanneer het statusfilter wisselt', async () => {
        fetchMock.mockImplementation((url: string) => {
          if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
            return Promise.resolve({ ok: true, json: async () => [] });
          }
          if (typeof url === 'string' && url.startsWith('/api/bestelheaders/')) {
            return Promise.resolve({ ok: false });
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        });
        renderSection({ bestellingen: [VERSTUURD] });
        fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
        fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        await waitFor(() => expect(screen.getByTestId('bestellingen-afronden-fout')).toBeInTheDocument());

        fireEvent.click(screen.getByTestId('data-table-quick-alle'));

        expect(screen.queryByTestId('bestellingen-afronden-fout')).not.toBeInTheDocument();
      });
    });
  });

  it('keeps rendering the whole section when the bedrijfsgegevens record exists but is incomplete', async () => {
    // VersturenNaarDrukkerDialog is altijd gemount en bouwt de drukkersmail op.
    // Toen die opbouw nog gooide op een ontbrekend veld, sleurde één onvolledig
    // bedrijfsgegeven het complete bestellingenscherm mee -- geen tabel, geen
    // filters, geen afronden. Dat mag nooit meer kunnen.
    bedrijfsgegevensRespons = { ...BEDRIJFSGEGEVENS_SEED, kvkNummer: undefined, bezoekadres: undefined };
    const teVersturen = { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const };

    renderSection({ bestellingen: [teVersturen, BESTELLINGEN[1]] });

    // Eerst de dialoog openen en wachten tot het onvolledige record echt
    // verwerkt is -- anders slaagt deze test ook zonder fix, simpelweg omdat de
    // tabel al gerenderd was voordat de fetch terugkwam.
    fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
    fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
    fireEvent.click(screen.getByTestId('bestellingen-versturen-naar-drukker'));
    expect(await screen.findByTestId('drukker-versturen-bedrijfsgegevens-onvolledig')).toBeInTheDocument();

    // En dan de kern: de sectie eromheen staat er nog steeds.
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-quick-verstuurd')).toBeInTheDocument();
  });

});
