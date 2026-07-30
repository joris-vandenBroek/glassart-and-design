import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KunstenaarsSection } from '@/components/beheer/KunstenaarsSection';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Kunstwerk } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const uploadMock = vi.fn();
let mockUploading = false;
let mockUploadError: 'upload' | null = null;

vi.mock('@/lib/useKunstwerkFotoUpload', () => ({
  useKunstwerkFotoUpload: () => ({ uploading: mockUploading, error: mockUploadError, upload: uploadMock }),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Every POST /api/kunstenaars mints a NEW id, so a test can prove the add path
// reuses the same id across retries (via PATCH) instead of creating duplicates.
let autoIdCounter = 0;

// Per-test overrides for the two afspraken endpoints; default to a successful,
// empty companion record.
let afsprakenGetImpl: (id: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }> = async () => ({
  ok: true,
  json: async () => ({ prijsafspraken: null }),
});
let kunstenaarPostShouldFail = false;
let afsprakenPutShouldFail = false;

function defaultFetchImpl(url: string, init?: { method?: string; body?: string }) {
  const method = init?.method ?? 'GET';

  if (url === '/api/kunstenaars' && method === 'POST') {
    if (kunstenaarPostShouldFail) return Promise.resolve({ ok: false, json: async () => ({}) });
    const data = JSON.parse(init!.body!) as Record<string, unknown>;
    const id = `nieuwe-ka-id-${++autoIdCounter}`;
    return Promise.resolve({ ok: true, json: async () => ({ id, ...data }) });
  }
  if (url.startsWith('/api/kunstenaars/') && method === 'PATCH') {
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  }
  if (url.startsWith('/api/kunstenaarAfspraken/') && method === 'PUT') {
    if (afsprakenPutShouldFail) return Promise.resolve({ ok: false, json: async () => ({}) });
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  }
  if (url.startsWith('/api/kunstenaarAfspraken/') && method === 'GET') {
    const id = url.replace('/api/kunstenaarAfspraken/', '');
    return afsprakenGetImpl(id);
  }
  return Promise.resolve({ ok: true, json: async () => ({}) });
}

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

const KLANTEN: Klant[] = [
  {
    id: 'klant-1',
    companyName: 'Galerie De Boer',
    kvk: '12345678',
    contactPerson: 'Jan de Boer',
    email: 'jan@galeriedeboer.nl',
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
    prijsgroepId: null,
    kunstenaarId: null,
  },
  {
    id: 'klant-2',
    companyName: 'Sabrina Glasser (eigen account)',
    kvk: '87654321',
    contactPerson: 'Sabrina Glasser',
    email: 'sabrina@example.com',
    phone: '0612340000',
    contactPreference: 'email',
    address: 'Glasstraat 2',
    postcode: '5678 CD',
    city: 'Glasstad',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    status: 'Goedgekeurd',
    prijsgroepId: null,
    kunstenaarId: 'ka-1',
  },
  {
    id: 'klant-3',
    companyName: 'Kunsthandel Noord',
    kvk: '11223344',
    contactPerson: 'Tom Noord',
    email: 'tom@kunsthandelnoord.nl',
    phone: '0612349999',
    contactPreference: 'email',
    address: 'Noordweg 3',
    postcode: '9012 EF',
    city: 'Noordstad',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    status: 'Goedgekeurd',
    prijsgroepId: null,
    kunstenaarId: null,
  },
];

const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: 'Werkt met gesmolten glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: [],
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof KunstenaarsSection>> = {}) {
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(true);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(true);
  const onRefetch = overrides.onRefetch ?? vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KunstenaarsSection
        kunstenaars={KUNSTENAARS}
        klanten={KLANTEN}
        kunstwerken={[]}
        loadError={null}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onRefetch={onRefetch}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onUpdate, onRemove, onRefetch };
}

function kunstenaarPostCall() {
  return fetchMock.mock.calls.find((call) => call[0] === '/api/kunstenaars' && call[1]?.method === 'POST');
}

function afsprakenPutCalls() {
  return fetchMock.mock.calls.filter(
    (call) => (call[0] as string).startsWith('/api/kunstenaarAfspraken/') && call[1]?.method === 'PUT'
  );
}

beforeEach(() => {
  autoIdCounter = 0;
  uploadMock.mockReset();
  mockUploading = false;
  mockUploadError = null;
  logActiviteitMock.mockReset();
  afsprakenGetImpl = async () => ({ ok: true, json: async () => ({ prijsafspraken: null }) });
  kunstenaarPostShouldFail = false;
  afsprakenPutShouldFail = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(defaultFetchImpl);
});

describe('KunstenaarsSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('kunstenaars-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while kunstenaars is null and there is no error', () => {
    renderSection({ kunstenaars: null });
    expect(screen.queryByTestId('kunstenaars-section')).not.toBeInTheDocument();
  });

  it('lists kunstenaars with an "open" exclusiviteit summary when the list is empty', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Sabrina Glasser');
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Open voor alle klanten');
  });

  it('lists kunstenaars with the names of their exclusieve klanten when the list is non-empty', () => {
    renderSection({ kunstenaars: [{ ...KUNSTENAARS[0], exclusieveKlantIds: ['klant-1', 'klant-2'] }] });
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Galerie De Boer, Sabrina Glasser (eigen account)');
  });

  it('disables Opslaan until naam and the NL description are filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    expect(screen.getByTestId('kunstenaar-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Nieuwe Kunstenaar' } });
    expect(screen.getByTestId('kunstenaar-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Werkt met glas.' } });
    expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled();
  });

  it('adds a new kunstenaar with an uploaded photo and one exclusieve klant', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onRefetch } = renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-foto-preview')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Nieuwe Kunstenaar' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Werkt met glas.' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-prijsafspraken'), { target: { value: '30% commissie' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    // Public record: no prijsafspraken, it is not publicly readable.
    await waitFor(() => expect(kunstenaarPostCall()).toBeDefined());
    expect(JSON.parse(kunstenaarPostCall()![1].body as string)).toEqual({
      foto: 'https://storage.example.com/nieuw.jpg',
      naam: 'Nieuwe Kunstenaar',
      omschrijvingNl: 'Werkt met glas.',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
      exclusieveKlantIds: ['klant-1'],
    });
    // Companion record in the medewerker-only table.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/kunstenaarAfspraken/nieuwe-ka-id-1',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ prijsafspraken: '30% commissie' }) })
      )
    );
    expect(onRefetch).toHaveBeenCalled();
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_toegevoegd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Nieuwe Kunstenaar'
    );
  });

  it('a new kunstenaar cannot select a second exclusieve klant -- there is no own account yet to satisfy the rule', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-2'));
    expect(screen.getByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.'
    );
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-2')).not.toBeChecked();
  });

  it('allows a second exclusieve klant on an existing kunstenaar when one of the two is its own linked klant', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    // Opslaan stays disabled until the async prijsafspraken fetch settles (see the
    // sibling 'opens a row for editing pre-filled...' test) -- wait for it before saving.
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-2'));
    expect(screen.queryByTestId('kunstenaar-modal-error')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'ka-1',
        expect.objectContaining({ exclusieveKlantIds: ['klant-1', 'klant-2'] })
      )
    );
  });

  it('blocks picking two klanten that are both not the kunstenaar\'s own linked klant, even in edit mode', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-3'));
    expect(screen.getByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.'
    );
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-3')).not.toBeChecked();
  });

  it('disables a third klant checkbox once two are already checked', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-klant-2'));
    expect(screen.queryByTestId('kunstenaar-modal-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-3')).toBeDisabled();
  });

  it('re-validates exclusieveKlantIds at save time, blocking a save when the list became invalid outside this session', async () => {
    // Simulates staff having reassigned/cleared the own-klant link on the Klant screen
    // after this 2-entry list was originally saved as valid: neither klant-1 nor klant-3
    // has kunstenaarId 'ka-1', so this list is invalid even though no checkbox was ever
    // toggled in this render.
    const { onUpdate } = renderSection({
      kunstenaars: [{ ...KUNSTENAARS[0], exclusieveKlantIds: ['klant-1', 'klant-3'] }],
    });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());

    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Sabrina G.' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    expect(screen.getByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Bij 2 klanten moet één daarvan het klantaccount van deze kunstenaar zelf zijn.'
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('never writes prijsafspraken onto the publicly readable kunstenaars record', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Y' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-prijsafspraken'), { target: { value: 'geheim' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() => expect(kunstenaarPostCall()).toBeDefined());
    const body = JSON.parse(kunstenaarPostCall()![1].body as string);
    expect(Object.keys(body)).not.toContain('prijsafspraken');
  });

  it('pre-fills the prijsafspraken textarea from the kunstenaarAfspraken companion record', async () => {
    afsprakenGetImpl = async () => ({ ok: true, json: async () => ({ prijsafspraken: '20% commissie' }) });
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));

    await waitFor(() =>
      expect(screen.getByTestId('kunstenaar-modal-prijsafspraken')).toHaveValue('20% commissie')
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/kunstenaarAfspraken/ka-1');
  });

  it('leaves the prijsafspraken textarea empty when there is no companion record yet', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kunstenaarAfspraken/ka-1'));
    expect(screen.getByTestId('kunstenaar-modal-prijsafspraken')).toHaveValue('');
  });

  it('opens a row for editing pre-filled and updates it, keeping its exclusieveKlantIds', async () => {
    afsprakenGetImpl = async () => ({ ok: true, json: async () => ({ prijsafspraken: '20% commissie' }) });
    const { onUpdate } = renderSection({
      kunstenaars: [{ ...KUNSTENAARS[0], exclusieveKlantIds: ['klant-1'] }],
    });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    expect(screen.getByTestId('kunstenaar-modal-naam')).toHaveValue('Sabrina Glasser');
    await waitFor(() =>
      expect(screen.getByTestId('kunstenaar-modal-prijsafspraken')).toHaveValue('20% commissie')
    );
    expect(screen.getByTestId('kunstenaar-modal-klant-klant-1')).toBeChecked();

    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Sabrina G.' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('ka-1', {
        foto: null,
        naam: 'Sabrina G.',
        omschrijvingNl: 'Werkt met gesmolten glas.',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        exclusieveKlantIds: ['klant-1'],
      })
    );
    expect(afsprakenPutCalls()).toContainEqual([
      '/api/kunstenaarAfspraken/ka-1',
      expect.objectContaining({ body: JSON.stringify({ prijsafspraken: '20% commissie' }) }),
    ]);
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_gewijzigd',
      expect.anything(),
      'Sabrina G.'
    );
  });

  it('deletes a kunstenaar and logs kunstenaar_verwijderd', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ka-1'));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_verwijderd',
      expect.anything(),
      'Sabrina Glasser'
    );
  });

  it('shows an action error and does not log when adding fails', async () => {
    kunstenaarPostShouldFail = true;
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));
    expect(await screen.findByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows an action error and does not log when editing fails', async () => {
    const onUpdate = vi.fn().mockResolvedValue(false);
    renderSection({ onUpdate });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));
    expect(await screen.findByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('disables Opslaan until the prijsafspraken fetch has settled', async () => {
    let resolveFetch: (body: { prijsafspraken: string | null }) => void = () => {};
    afsprakenGetImpl = () =>
      new Promise((resolve) => {
        resolveFetch = (body) => resolve({ ok: true, json: async () => body });
      });
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));

    // naam/omschrijving are prefilled synchronously, so without the loading guard
    // Opslaan would already be clickable here and would save an empty afspraak.
    expect(screen.getByTestId('kunstenaar-modal-opslaan')).toBeDisabled();
    resolveFetch({ prijsafspraken: '20% commissie' });
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-opslaan')).not.toBeDisabled());
    expect(screen.getByTestId('kunstenaar-modal-prijsafspraken')).toHaveValue('20% commissie');
  });

  it('does not let a slow fetch for one kunstenaar overwrite the form of another', async () => {
    let resolveEerste: (body: { prijsafspraken: string | null }) => void = () => {};
    afsprakenGetImpl = (id) => {
      if (id === 'ka-1') {
        return new Promise((resolve) => {
          resolveEerste = (body) => resolve({ ok: true, json: async () => body });
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ prijsafspraken: 'afspraken van ka-2' }) });
    };
    renderSection({
      kunstenaars: [KUNSTENAARS[0], { ...KUNSTENAARS[0], id: 'ka-2', naam: 'Bram Steen' }],
    });

    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-ka-2'));
    await waitFor(() =>
      expect(screen.getByTestId('kunstenaar-modal-prijsafspraken')).toHaveValue('afspraken van ka-2')
    );

    // The stale fetch for ka-1 resolves last and must be ignored.
    resolveEerste({ prijsafspraken: 'afspraken van ka-1' });
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-naam')).toHaveValue('Bram Steen'));
    expect(screen.getByTestId('kunstenaar-modal-prijsafspraken')).toHaveValue('afspraken van ka-2');
  });

  it('blocks saving and shows an error when the prijsafspraken fetch fails', async () => {
    afsprakenGetImpl = () => Promise.reject(new Error('offline'));
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));

    expect(await screen.findByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'De prijsafspraken konden niet geladen worden.'
    );
    // Saving stays blocked: falling back to '' would wipe a good companion record.
    expect(screen.getByTestId('kunstenaar-modal-opslaan')).toBeDisabled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reuses the same generated id when a failed add is retried, instead of duplicating', async () => {
    // First attempt: the kunstenaar POST succeeds but the companion write fails.
    afsprakenPutShouldFail = true;
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Nieuw' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Glas.' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));
    await screen.findByTestId('kunstenaar-modal-error');

    // Retry from the still-open modal.
    afsprakenPutShouldFail = false;
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));
    await waitFor(() => expect(screen.queryByTestId('kunstenaar-modal')).not.toBeInTheDocument());

    const kunstenaarPostCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/api/kunstenaars' && call[1]?.method === 'POST'
    );
    const kunstenaarPatchCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/api/kunstenaars/nieuwe-ka-id-1' && call[1]?.method === 'PATCH'
    );
    expect(kunstenaarPostCalls).toHaveLength(1);
    expect(kunstenaarPatchCalls).toHaveLength(1);
  });

  it('still saves successfully when only the refetch afterwards fails', async () => {
    const onRefetch = vi.fn().mockResolvedValue(false);
    renderSection({ onRefetch });
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Nieuw' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Glas.' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    // Both writes are durable, so a read-side failure must not present the save as failed.
    await waitFor(() => expect(screen.queryByTestId('kunstenaar-modal')).not.toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'kunstenaar_toegevoegd',
      expect.anything(),
      'Nieuw'
    );
  });

  it('blocks deleting a kunstenaar that is still linked to a kunstwerk', async () => {
    const { onRemove } = renderSection({
      kunstwerken: [{ id: 'kw-1', kunstenaarId: 'ka-1' } as never],
    });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));
    expect(await screen.findByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Deze kunstenaar is nog aan een kunstwerk gekoppeld en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('blocks deleting while the kunstwerken have not loaded, instead of assuming "not in use"', async () => {
    const { onRemove } = renderSection({ kunstwerken: null });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));
    expect(await screen.findByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Kan nog niet controleren of deze kunstenaar in gebruik is. Probeer het opnieuw.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Kunstenaar toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Kunstenaar bewerken');
  });
});
