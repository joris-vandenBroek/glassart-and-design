import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DrukkerModal } from '@/components/beheer/DrukkerModal';
import type { Drukker } from '@/components/beheer/materiaalTypes';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
}));

const DRUKKER: Drukker = {
  id: 'drukker-1',
  naam: 'Drukkerij Janssen',
  adres: 'Perslaan 1',
  postcode: '1000 AA',
  plaats: 'Utrecht',
  email: 'info@janssen.nl',
  prijsafspraken: '',
};

function renderModal(
  state: { mode: 'edit'; drukker: Drukker } | { mode: 'add' } | null,
  overrides: { bestellingen?: Bestelling[] | null; onBestellingUpdated?: (b: Bestelling) => void } = {}
) {
  const onClose = vi.fn();
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  const onBestellingUpdated = overrides.onBestellingUpdated ?? vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkerModal
        state={state}
        bestellingen={'bestellingen' in overrides ? overrides.bestellingen ?? null : []}
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onAdd, onUpdate, onRemove, onBestellingUpdated };
}

beforeEach(() => {
  fetchMock.mockReset();
  logActiviteitMock.mockReset();
});

describe('DrukkerModal verplichte velden', () => {
  it('shows the required-field legend', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'add' });
    expect(screen.getByTestId('drukker-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});

describe('DrukkerModal standaard', () => {
  it('defaults the standaard checkbox to unchecked when adding a new drukker', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'add' });
    expect(screen.getByTestId('drukker-modal-standaard')).not.toBeChecked();
  });

  it('pre-fills the standaard checkbox from the drukker when editing', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'edit', drukker: { ...DRUKKER, standaard: true } });
    expect(screen.getByTestId('drukker-modal-standaard')).toBeChecked();
  });

  it('includes standaard in the payload passed to onAdd when toggled on', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onAdd } = renderModal({ mode: 'add' });
    fireEvent.change(screen.getByTestId('drukker-modal-naam'), { target: { value: 'Nieuwe' } });
    fireEvent.change(screen.getByTestId('drukker-modal-email'), { target: { value: 'x@y.nl' } });
    fireEvent.click(screen.getByTestId('drukker-modal-standaard'));
    fireEvent.click(screen.getByTestId('drukker-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ naam: 'Nieuwe', email: 'x@y.nl', standaard: true })
      )
    );
  });
});

describe('DrukkerModal zendingen', () => {
  it('shows "nog geen mails verzonden" once loaded empty', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    expect(await screen.findByTestId('drukker-modal-zendingen-leeg')).toHaveTextContent(
      'Nog geen mails verzonden.'
    );
  });

  it('lists zendingen and expands one to show the full mail body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: '2026-07-24T10:00:00Z',
          onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
          body: '== Testbedrijf BV ==\nAfleveradres: Teststraat 1, 1234 AB Teststad\n- Hotel paneel',
          bestellingIds: ['header-1'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
        },
      ],
    });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('1');
    expect(screen.queryByText(/Testbedrijf BV/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('drukker-zending-bekijken-zending-1'));
    expect(screen.getByText(/Testbedrijf BV/)).toBeInTheDocument();
  });

  it('shows the zendingnummer before the datum when present', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-2',
          verzondenOp: '2026-08-07T10:00:00Z',
          onderwerp: 'ZD-00007 — Nieuwe order(s) voor de drukker – 7-8-2026',
          body: '...',
          bestellingIds: ['header-2'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
          zendingnummer: 'ZD-00007',
        },
      ],
    });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-2');
    expect(zendingRow).toHaveTextContent('ZD-00007');
  });

  it('disables Verwijderen while zendingen are still loading', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderModal({ mode: 'edit', drukker: DRUKKER });
    expect(screen.getByTestId('drukker-modal-verwijderen')).toBeDisabled();
  });

  it('blocks deleting a drukker that has zendingen', async () => {
    const onRemove = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: null,
          onderwerp: 'x',
          body: 'x',
          bestellingIds: [],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'x',
        },
      ],
    });
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <DrukkerModal
          state={{ mode: 'edit', drukker: DRUKKER }}
          bestellingen={[]}
          onClose={vi.fn()}
          onAdd={vi.fn()}
          onUpdate={vi.fn().mockResolvedValue(true)}
          onRemove={onRemove}
          onBestellingUpdated={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    await waitFor(() => expect(screen.getByTestId('drukker-modal-verwijderen')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('drukker-modal-verwijderen'));
    expect(await screen.findByTestId('drukker-modal-error')).toHaveTextContent(
      'Deze drukker heeft al verzonden mails en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('caps the zendingen list height so it scrolls independently of the modal frame', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: '2026-07-24T10:00:00Z',
          onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
          body: '== Testbedrijf BV ==',
          bestellingIds: ['header-1'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
        },
      ],
    });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    const list = zendingRow.closest('ul');
    expect(list?.className).toMatch(/max-h-64/);
    expect(list?.className).toMatch(/overflow-y-auto/);
  });
});

describe('DrukkerModal — zending afronden', () => {
  const BESTELLING_1: Bestelling = {
    id: 'header-1',
    klantnr: 'KN-1',
    companyName: 'Testbedrijf BV',
    bestelnr: 'GD-00201',
    besteldatum: '1-7-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [],
  };
  const BESTELLING_2: Bestelling = { ...BESTELLING_1, id: 'header-2', bestelnr: 'GD-00202' };

  function mockZending(bestellingIds: string[]) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'zending-1',
          verzondenOp: '2026-07-24T10:00:00Z',
          onderwerp: 'x',
          body: 'x',
          bestellingIds,
          aantalKlanten: 1,
          aantalRegels: bestellingIds.length,
          verzondDoor: 'paul@glassartanddesign.com',
        },
      ],
    });
  }

  it('shows "0 / 2 afgerond" and the afronden button when none of the zending\'s bestellingen are done', async () => {
    mockZending(['header-1', 'header-2']);
    renderModal({ mode: 'edit', drukker: DRUKKER }, { bestellingen: [BESTELLING_1, BESTELLING_2] });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('0 / 2 afgerond');
    expect(screen.getByTestId('drukker-zending-afronden-zending-1')).toBeInTheDocument();
  });

  it('hides the afronden button once every bestelling in the zending is Te factureren', async () => {
    mockZending(['header-1', 'header-2']);
    renderModal(
      { mode: 'edit', drukker: DRUKKER },
      {
        bestellingen: [
          { ...BESTELLING_1, status: 'Te factureren' },
          { ...BESTELLING_2, status: 'Te factureren' },
        ],
      }
    );
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('2 / 2 afgerond');
    expect(screen.queryByTestId('drukker-zending-afronden-zending-1')).not.toBeInTheDocument();
  });

  it('still counts a bestelling as afgerond once it has moved on to Betaald en afgerond', async () => {
    mockZending(['header-1', 'header-2']);
    renderModal(
      { mode: 'edit', drukker: DRUKKER },
      {
        bestellingen: [
          { ...BESTELLING_1, status: 'Te factureren' },
          { ...BESTELLING_2, status: 'Betaald en afgerond' },
        ],
      }
    );
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('2 / 2 afgerond');
    expect(screen.queryByTestId('drukker-zending-afronden-zending-1')).not.toBeInTheDocument();
  });

  it('marks every Verstuurd-naar-drukker bestelling in the zending as Te factureren, sequentially, and logs each one', async () => {
    mockZending(['header-1', 'header-2']);
    const { onBestellingUpdated } = renderModal(
      { mode: 'edit', drukker: DRUKKER },
      { bestellingen: [BESTELLING_1, BESTELLING_2] }
    );
    await screen.findByTestId('drukker-zending-zending-1');
    fetchMock.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByTestId('drukker-zending-afronden-zending-1'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Te factureren' }) })
      )
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-2',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Te factureren' }) })
      )
    );
    await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalledTimes(2));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afgerond',
      'GD-00201'
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afgerond',
      'GD-00202'
    );
  });

  it('stops on the first failing PATCH and reports how many succeeded', async () => {
    mockZending(['header-1', 'header-2']);
    renderModal({ mode: 'edit', drukker: DRUKKER }, { bestellingen: [BESTELLING_1, BESTELLING_2] });
    await screen.findByTestId('drukker-zending-zending-1');
    let call = 0;
    fetchMock.mockImplementation(() => {
      call += 1;
      return call === 1 ? Promise.resolve({ ok: true }) : Promise.reject(new Error('offline'));
    });
    fireEvent.click(screen.getByTestId('drukker-zending-afronden-zending-1'));

    expect(await screen.findByTestId('drukker-zending-afronden-error')).toHaveTextContent('1');
  });

  it('renders no afgerond badge and no afronden button while bestellingen is still loading (null)', async () => {
    mockZending(['header-1', 'header-2']);
    renderModal({ mode: 'edit', drukker: DRUKKER }, { bestellingen: null });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(within(zendingRow).queryByTestId('drukker-zending-afgerond-badge-zending-1')).not.toBeInTheDocument();
    expect(within(zendingRow).queryByTestId('drukker-zending-afronden-zending-1')).not.toBeInTheDocument();
  });
});
