import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BestellingenSection, type Bestelling } from '@/components/beheer/BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort, Drukker } from '@/components/beheer/materiaalTypes';
import type { Klant } from '@/components/beheer/KlantenSection';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: vi.fn(),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
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
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Veiligheidsglas' }];

const KLANTEN: Klant[] = [
  {
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
  },
];

const DRUKKERS: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
];

const BESTELLINGEN: Bestelling[] = [
  {
    id: 'header-1',
    klantId: 'uid-1',
    companyName: 'Testbedrijf BV',
    bestelnr: 'GD-00301',
    besteldatum: '1-7-2026',
    status: 'Te beoordelen',
    lineCount: 1,
    totalQuantity: 3,
    lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 }],
  },
  {
    id: 'header-2',
    klantId: 'uid-2',
    companyName: 'Ander Bedrijf',
    bestelnr: 'GD-00302',
    besteldatum: '2-7-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof BestellingenSection>> = {}) {
  const onBestellingUpdated = vi.fn();
  const onLinePrijsVastgesteld = vi.fn();
  const onLineUpdated = vi.fn();

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
          drukkers={DRUKKERS}
          loadError={null}
          onBestellingUpdated={onBestellingUpdated}
          onLinePrijsVastgesteld={onLinePrijsVastgesteld}
          onLineUpdated={onLineUpdated}
          {...props}
        />
      </NextIntlClientProvider>
    );
  }

  const { rerender: rtlRerender } = render(element(overrides));
  function rerender(bestellingen: Bestelling[]) {
    rtlRerender(element({ bestellingen }));
  }
  return { onBestellingUpdated, onLinePrijsVastgesteld, onLineUpdated, rerender };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
  vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
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

  it('keeps the modal open and reflects the new price after "Prijs vaststellen", without closing it', async () => {
    const bestellingenMetEigenMaat = [
      {
        ...BESTELLINGEN[0],
        lines: [{ id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 }],
      },
    ];
    const { onLinePrijsVastgesteld } = renderSection({ bestellingen: bestellingenMetEigenMaat });
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3'));

    await waitFor(() => expect(onLinePrijsVastgesteld).toHaveBeenCalledWith('header-1', 'line-3', 275));
    expect(screen.getByTestId('bestelling-modal')).toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-line-line-3')).toHaveTextContent('€ 275,00');
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

    it('opens the VersturenNaarDrukkerDialog with only the selected bestellingen when the button is clicked', () => {
      const bestellingen = [TE_VERSTUREN, { ...BESTELLINGEN[1], id: 'header-3', status: 'Te versturen naar drukker' as const }];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.queryByTestId('drukker-versturen-drukker')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('bestellingen-versturen-naar-drukker'));

      expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
      expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV');
      expect(screen.getByTestId('drukker-versturen-preview')).not.toHaveTextContent('Ander Bedrijf');
    });

    it('reports each verstuurde bestelling, clears the selection, and closes the dialog on a successful send', async () => {
      const { onBestellingUpdated } = renderSection({ bestellingen: [TE_VERSTUREN] });
      fireEvent.click(screen.getByTestId('data-table-quick-te-versturen'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      fireEvent.click(screen.getByTestId('bestellingen-versturen-naar-drukker'));

      fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

      await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalled());
      expect(onBestellingUpdated.mock.calls[0][0]).toEqual({ ...TE_VERSTUREN, status: 'Verstuurd naar drukker' });
      expect(screen.queryByTestId('drukker-versturen-drukker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });
  });

  it('shows a help popover explaining the drukker flow', () => {
    renderSection();
    expect(screen.queryByTestId('bestellingen-help-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bestellingen-help'));
    expect(screen.getByTestId('bestellingen-help-popover')).toHaveTextContent('drukker');
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
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Afgerond' })
      );
      expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();
    });

    it('toont de dialoog met de openstaande genoot en rondt bij "alleen deze" alleen de selectie af', async () => {
      const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
      mockLookup([
        {
          id: 'z1',
          drukkerId: 'drukker-1',
          drukkerNaam: 'Drukkerij Janssen',
          verzondenOp: '2026-08-03T10:00:00Z',
          bestellingIds: ['header-2', 'header-9'],
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
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Afgerond' });
    });

    it('rondt bij "ook deze" de selectie én de genoten af', async () => {
      const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
      mockLookup([
        {
          id: 'z1',
          drukkerId: 'drukker-1',
          drukkerNaam: 'Drukkerij Janssen',
          verzondenOp: '2026-08-03T10:00:00Z',
          bestellingIds: ['header-2', 'header-9'],
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
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Afgerond' })
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
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Afgerond' })
      );
      await waitFor(() => expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument());
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
                  drukkerId: 'drukker-1',
                  drukkerNaam: 'Drukkerij Janssen',
                  verzondenOp: '2026-08-03T10:00:00Z',
                  bestellingIds: ['header-2', 'header-9'],
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
        expect(onBestellingUpdated).toHaveBeenCalledWith({ ...VERSTUURD, status: 'Afgerond' });
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

      it('wist de foutmelding van een andere afrondronde ook wanneer de bevestigingsdialoog met Annuleren wordt gesloten', async () => {
        // Simuleert de race die kan ontstaan doordat afrondBezig een gedeelde
        // vlag is: de zending-lookup voor header-2 (die de dialoog toont)
        // blijft hangen, terwijl ondertussen een heel ander, direct afgerond
        // -- en mislukt -- rondje (header-5, via de losse modal-knop) al klaar
        // is en afrondFout heeft gezet. Zodra de trage lookup alsnog genoten
        // oplevert, opent de dialoog met die oude fout nog zichtbaar erboven.
        const genoot = { ...BESTELLINGEN[1], id: 'header-9', bestelnr: 'GD-00309' };
        const header5 = { ...BESTELLINGEN[1], id: 'header-5', bestelnr: 'GD-00305' };

        let resolveHeader2Lookup: (value: { ok: boolean; json: () => Promise<unknown> }) => void =
          () => {};
        const header2LookupPromise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
          (resolve) => {
            resolveHeader2Lookup = resolve;
          }
        );

        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
          if (typeof url === 'string' && url.startsWith('/api/drukkerzendingen')) {
            if (url.includes('header-2')) {
              return header2LookupPromise;
            }
            return Promise.resolve({ ok: true, json: async () => [] });
          }
          if (
            typeof url === 'string' &&
            url.startsWith('/api/bestelheaders/header-5') &&
            init?.method === 'PATCH'
          ) {
            return Promise.resolve({ ok: false });
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        renderSection({ bestellingen: [VERSTUURD, genoot, header5] });
        fireEvent.click(screen.getByTestId('data-table-quick-verstuurd'));
        fireEvent.click(screen.getByTestId('data-table-row-select-header-2'));
        fireEvent.click(screen.getByTestId('bestellingen-afronden'));

        // header-2's lookup hangt nog -- ondertussen rondt de medewerker
        // header-5 los af via de modal, en dat mislukt.
        fireEvent.click(screen.getByTestId('data-table-row-header-5'));
        fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

        await waitFor(() => expect(screen.getByTestId('bestellingen-afronden-fout')).toBeInTheDocument());
        expect(screen.queryByTestId('afronden-bevestiging')).not.toBeInTheDocument();

        resolveHeader2Lookup({
          ok: true,
          json: async () => [
            {
              id: 'z1',
              drukkerId: 'drukker-1',
              drukkerNaam: 'Drukkerij Janssen',
              verzondenOp: '2026-08-03T10:00:00Z',
              bestellingIds: ['header-2', 'header-9'],
            },
          ],
        });

        await waitFor(() => expect(screen.getByTestId('afronden-bevestiging')).toBeInTheDocument());
        expect(screen.getByTestId('bestellingen-afronden-fout')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('afronden-bevestiging-annuleren'));

        expect(screen.queryByTestId('bestellingen-afronden-fout')).not.toBeInTheDocument();
      });
    });
  });
});
