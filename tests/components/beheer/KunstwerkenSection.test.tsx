import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KunstwerkenSection } from '@/components/beheer/KunstwerkenSection';
import type { Kunstwerk, Segment, Materiaal, Maat, Stijl, Onderwerp } from '@/components/beheer/materiaalTypes';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { CartProvider } from '@/lib/useCart';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const uploadMock = vi.fn();
let mockUploading = false;
let mockUploadError: 'upload' | null = null;

vi.mock('@/lib/useKunstwerkFotoUpload', () => ({
  useKunstwerkFotoUpload: () => ({ uploading: mockUploading, error: mockUploadError, upload: uploadMock }),
}));

const detectFormaatFromFileMock = vi.fn();
const detectFormaatFromImageUrlMock = vi.fn();

vi.mock('@/lib/detectKunstwerkFormaat', () => ({
  detectFormaatFromFile: (...args: unknown[]) => detectFormaatFromFileMock(...args),
  detectFormaatFromImageUrl: (...args: unknown[]) => detectFormaatFromImageUrlMock(...args),
}));

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

const SEGMENTEN: Segment[] = [
  { id: 'seg-1', omschrijving: 'Hotel' },
  { id: 'seg-2', omschrijving: 'Restaurant' },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Acryl' },
];
const MATEN: Maat[] = [
  { id: 'maat-1', breedte: 40, hoogte: 60 },
  { id: 'maat-2', breedte: 60, hoogte: 90 },
  { id: 'maat-3', breedte: 50, hoogte: 50 },
];
const STIJLEN: Stijl[] = [
  { id: 'stijl-1', omschrijving: 'Abstract' },
  { id: 'stijl-2', omschrijving: 'Minimalistisch' },
];
const ONDERWERPEN: Onderwerp[] = [
  { id: 'onderwerp-1', omschrijving: 'Bloemen' },
  { id: 'onderwerp-2', omschrijving: 'Landschappen' },
];
const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: 'Werkt met glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: null,
  },
];
const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://storage.example.com/kw-1.jpg',
    naam: 'Hotel paneel 1',
    kunstenaarId: null,
    formaat: 'staand',
    segmentIds: ['seg-1'],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],
    omschrijvingNl: 'Hotel paneel 1',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof KunstwerkenSection>> = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(true);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(true);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(true);
  const onAddStijl = overrides.onAddStijl ?? vi.fn().mockResolvedValue(true);
  const onAddOnderwerp = overrides.onAddOnderwerp ?? vi.fn().mockResolvedValue(true);
  const result = render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <KunstwerkenSection
            kunstwerken={KUNSTWERKEN}
            segmenten={SEGMENTEN}
            materialen={MATERIALEN}
            maten={MATEN}
            stijlen={STIJLEN}
            onderwerpen={ONDERWERPEN}
            kunstenaars={KUNSTENAARS}
            loadError={null}
            onAdd={onAdd}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onAddStijl={onAddStijl}
            onAddOnderwerp={onAddOnderwerp}
            {...overrides}
          />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove, onAddStijl, onAddOnderwerp, rerender: result.rerender };
}

beforeEach(() => {
  uploadMock.mockReset();
  mockUploading = false;
  mockUploadError = null;
  logActiviteitMock.mockReset();
  detectFormaatFromFileMock.mockReset();
  detectFormaatFromFileMock.mockResolvedValue(null);
  detectFormaatFromImageUrlMock.mockReset();
  detectFormaatFromImageUrlMock.mockResolvedValue(null);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user: null }) });
  window.localStorage.clear();
});

describe('KunstwerkenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('kunstwerken-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while kunstwerken is null and there is no error', () => {
    renderSection({ kunstwerken: null });
    expect(screen.queryByTestId('kunstwerken-section')).not.toBeInTheDocument();
  });

  it('lists kunstwerken with their segment names and NL description', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-kw-1')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('data-table-row-kw-1')).toHaveTextContent('Hotel paneel 1');
  });

  it('pre-checks every materiaal and maat checkbox when opening "Kunstwerk toevoegen"', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-2')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-2')).toBeChecked();
  });

  it('keeps Opslaan disabled until a photo is uploaded, then enables once all required fields are filled', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled(); // naam, prijs, omschrijving and formaat still missing

    // Pick the formaat before narrowing materiaal/maat: choosing a formaat re-checks every
    // materiaal and every compatible maat, so narrowing first would just get overwritten.
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled(); // naam, prijs and omschrijving still missing

    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Test' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
  });

  it('uploads a dropped photo via the drop zone', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/gedropt.jpg');
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'gedropt.jpg', { type: 'image/jpeg' });
    fireEvent.drop(screen.getByTestId('kunstwerk-modal-foto-dropzone'), {
      dataTransfer: { files: [file] },
    });
    await waitFor(() => expect(uploadMock).toHaveBeenCalledWith(file));
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
  });

  it('rebuilds the price grid when the materiaal/maat selection changes', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-2-maat-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    expect(screen.queryByTestId('kunstwerk-modal-prijs-mat-2-maat-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    expect(screen.queryByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).not.toBeInTheDocument();
  });

  it('adds a new kunstwerk with the uploaded photo, selections, prices and NL description', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Vibrant Spirit' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-kunstenaar'), { target: { value: 'ka-1' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        foto: 'https://storage.example.com/nieuw.jpg',
        naam: 'Vibrant Spirit',
        kunstenaarId: 'ka-1',
        formaat: 'staand',
        segmentIds: ['seg-1'],
        materiaalIds: ['mat-1'],
        maatIds: ['maat-1'],
        stijlIds: [],
        onderwerpIds: [],
        aiGegenereerd: false,
        prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 99 }],
        omschrijvingNl: 'Nieuw kunstwerk',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
  });

  it('opens a row for editing pre-filled, including the price grid, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    expect(screen.getByTestId('kunstwerk-modal-segment-seg-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).toHaveValue(150);
    expect(screen.getByTestId('kunstwerk-modal-naam')).toHaveValue('Hotel paneel 1');
    expect(screen.getByTestId('kunstwerk-modal-omschrijving-nl')).toHaveValue('Hotel paneel 1');
    expect(screen.getByTestId('kunstwerk-modal-formaat-staand')).toBeChecked();

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('kw-1', {
        foto: 'https://storage.example.com/kw-1.jpg',
        naam: 'Hotel paneel 1',
        kunstenaarId: null,
        formaat: 'staand',
        segmentIds: ['seg-1'],
        materiaalIds: ['mat-1'],
        maatIds: ['maat-1'],
        stijlIds: [],
        onderwerpIds: [],
        aiGegenereerd: false,
        prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 175 }],
        omschrijvingNl: 'Hotel paneel 1',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
  });

  it('deletes a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('kw-1'));
  });

  it('shows an action error and keeps the modal open when onUpdate fails', async () => {
    const { onUpdate } = renderSection({ onUpdate: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));
    expect(await screen.findByTestId('kunstwerk-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('kunstwerk-modal')).toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalled();
  });

  it('shows an upload error message when the upload hook reports an error', () => {
    mockUploadError = 'upload';
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-foto-error')).toHaveTextContent(
      'De foto kon niet geüpload worden. Probeer het opnieuw.'
    );
  });

  it('logs kunstwerk_toegevoegd with the logged-in medewerker when adding', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'kunstwerk_toegevoegd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Nieuw kunstwerk'
      )
    );
  });

  it('logs kunstwerk_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'kunstwerk_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Hotel paneel 1'
      )
    );
  });

  it('logs kunstwerk_verwijderd with the logged-in medewerker when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijderen'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'kunstwerk_verwijderd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Hotel paneel 1'
      )
    );
  });

  it('does not log when adding fails', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await screen.findByTestId('kunstwerk-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows a "Materialen/maten aanvullen" button when a kunstwerk is missing some materialen or maten, and fills them in on click', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    renderSection({ onUpdate }); // kw-1 only has mat-1/maat-1 out of 2 materialen/3 maten

    const button = screen.getByTestId('kunstwerken-backfill-materialen-maten');
    expect(button).toHaveTextContent('1');
    fireEvent.click(button);

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'kw-1',
        expect.objectContaining({ materiaalIds: ['mat-1', 'mat-2'], maatIds: ['maat-1', 'maat-2', 'maat-3'] })
      )
    );
  });

  it('does not show the "Materialen/maten aanvullen" button when every kunstwerk already has everything checked', () => {
    const volledig: Kunstwerk = {
      ...KUNSTWERKEN[0],
      materiaalIds: ['mat-1', 'mat-2'],
      maatIds: ['maat-1', 'maat-2', 'maat-3'],
      prijzen: [
        { materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 },
        { materiaalId: 'mat-1', maatId: 'maat-2', prijs: 175 },
        { materiaalId: 'mat-1', maatId: 'maat-3', prijs: 140 },
        { materiaalId: 'mat-2', maatId: 'maat-1', prijs: 160 },
        { materiaalId: 'mat-2', maatId: 'maat-2', prijs: 185 },
        { materiaalId: 'mat-2', maatId: 'maat-3', prijs: 150 },
      ],
    };
    renderSection({ kunstwerken: [volledig] });
    expect(screen.queryByTestId('kunstwerken-backfill-materialen-maten')).not.toBeInTheDocument();
  });

  it('never targets a materiaalloos kunstwerk with the "Materialen/maten aanvullen" backfill', async () => {
    const materiaalloos: Kunstwerk = {
      ...KUNSTWERKEN[0],
      id: 'kw-akoestisch',
      materiaalIds: [],
      maatIds: [],
      prijzen: [],
      prijsPerM2: 120,
    };
    const onUpdate = vi.fn().mockResolvedValue(true);
    // kw-1 (normal, incomplete) + kw-akoestisch (materiaalloos) in the list.
    renderSection({ kunstwerken: [KUNSTWERKEN[0], materiaalloos], onUpdate });

    const button = screen.getByTestId('kunstwerken-backfill-materialen-maten');
    // Only kw-1 should be counted, never the materiaalloos kunstwerk.
    expect(button).toHaveTextContent('1');
    fireEvent.click(button);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('kw-1', expect.anything()));
    expect(onUpdate).not.toHaveBeenCalledWith('kw-akoestisch', expect.anything());
  });

  it('shows a backfill button for kunstwerken without a naam and fills naam from the NL description on click', async () => {
    const zonderNaam: Kunstwerk = {
      ...KUNSTWERKEN[0],
      id: 'kw-2',
      naam: '',
      omschrijvingNl: 'Restaurant paneel 3',
    };
    const onUpdate = vi.fn().mockResolvedValue(true);
    renderSection({ kunstwerken: [...KUNSTWERKEN, zonderNaam], onUpdate });

    const backfillButton = screen.getByTestId('kunstwerken-backfill-namen');
    expect(backfillButton).toHaveTextContent('1');
    fireEvent.click(backfillButton);

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        'kw-2',
        expect.objectContaining({ naam: 'Restaurant paneel 3' })
      )
    );
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'kunstwerk_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Restaurant paneel 3'
      )
    );
  });

  it('does not show the backfill button when every kunstwerk already has a naam', () => {
    renderSection();
    expect(screen.queryByTestId('kunstwerken-backfill-namen')).not.toBeInTheDocument();
  });

  it('keeps the materialen/maten panel collapsed by default and expands it when clicked', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const toggle = screen.getByTestId('kunstwerk-modal-materialen-maten-toggle');
    expect(toggle.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(toggle);
    expect(toggle.closest('details')).toHaveAttribute('open');
  });

  it('shows a "Prijs per m²" field instead of the price matrix once every materiaal is unchecked, and saves it', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materialen-maten-toggle'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    expect(screen.queryByTestId('kunstwerk-modal-prijzen')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-per-m2')).toBeInTheDocument();

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Akoestisch paneel' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Verbetert de akoestiek.' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-per-m2'), { target: { value: '180' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        foto: 'https://storage.example.com/nieuw.jpg',
        naam: 'Akoestisch paneel',
        kunstenaarId: null,
        formaat: 'vierkant',
        segmentIds: ['seg-1'],
        materiaalIds: [],
        maatIds: [],
        stijlIds: [],
        onderwerpIds: [],
        aiGegenereerd: false,
        prijzen: [],
        prijsPerM2: 180,
        omschrijvingNl: 'Verbetert de akoestiek.',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
  });

  it('shows a "Prijs per m²" field and allows opslaan when a materiaal is chosen but every maat is unchecked, regardless of formaat', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materialen-maten-toggle'));
    // 'vierkant' auto-selects only the square maat (maat-3); unchecking it leaves 0 maten
    // while mat-1/mat-2 stay checked, so this is "materiaal wel, maat niet" — not materiaalloos.
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-3'));

    expect(screen.queryByTestId('kunstwerk-modal-prijzen')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-per-m2')).toBeInTheDocument();

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: '4mm veiligheidsglas per m2' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Op maat gezaagd.' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).toBeDisabled();

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-per-m2'), { target: { value: '65' } });
    expect(screen.getByTestId('kunstwerk-modal-opslaan')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          formaat: 'vierkant',
          materiaalIds: ['mat-1', 'mat-2'],
          maatIds: [],
          prijzen: [],
          prijsPerM2: 65,
        })
      )
    );
  });

  it('does not show the "kies minimaal één maat" hint once a materiaal is chosen but every maat is unchecked', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materialen-maten-toggle'));
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeChecked());

    // 'vierkant' auto-selects only the square maat (maat-3); unchecking it leaves 0 maten
    // while mat-1/mat-2 stay checked — a deliberate, valid "maatloos-met-materiaal" state,
    // not an incomplete/error one, so no "kies minimaal één maat" warning should appear.
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-3'));

    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeChecked());
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-2')).toBeChecked();
    expect(screen.queryByTestId('kunstwerk-modal-maten-hint')).not.toBeInTheDocument();
  });

  it('never targets a maatloos-met-materiaal kunstwerk (0 maten, materiaal wel gekozen) with the "Materialen/maten aanvullen" backfill', async () => {
    const maatloosMetMateriaal: Kunstwerk = {
      ...KUNSTWERKEN[0],
      id: 'kw-veiligheidsglas-per-m2',
      materiaalIds: ['mat-1'],
      maatIds: [],
      prijzen: [],
      prijsPerM2: 65,
    };
    const onUpdate = vi.fn().mockResolvedValue(true);
    renderSection({ kunstwerken: [KUNSTWERKEN[0], maatloosMetMateriaal], onUpdate });

    const button = screen.getByTestId('kunstwerken-backfill-materialen-maten');
    expect(button).toHaveTextContent('1'); // only kw-1 should be counted
    fireEvent.click(button);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('kw-1', expect.anything()));
    expect(onUpdate).not.toHaveBeenCalledWith('kw-veiligheidsglas-per-m2', expect.anything());
  });

  it('shows a hint that a formaat must be chosen, and hides it once one is picked', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    expect(screen.getByTestId('kunstwerk-modal-formaat-hint')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    expect(screen.queryByTestId('kunstwerk-modal-formaat-hint')).not.toBeInTheDocument();
  });

  it('deselects and disables incompatible maten when the formaat is changed, in both directions', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-3'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeDisabled();
  });

  it('selects every maat and disables none when Formaat "Alle" is chosen', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-alle'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-2')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeDisabled();
  });

  it('re-enables and re-checks every maat when switching from a narrower formaat to Alle', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1')); // kw-1: formaat 'staand', maatIds ['maat-1']
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeDisabled();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-alle'));
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).not.toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).not.toBeDisabled();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeChecked();
  });

  it('re-checks every materiaal and every compatible maat when the formaat changes, even if the admin had narrowed the selection first', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));

    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));

    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-2')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-2')).toBeChecked();
  });

  it('keeps a materiaalloos kunstwerk materiaalloos when a formaat is chosen afterwards', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));

    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-vierkant'));

    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-1')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-materiaal-mat-2')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-prijs-per-m2')).toBeInTheDocument();
  });

  it('pre-selects the detected formaat when a new photo is uploaded, overridable by the admin', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    detectFormaatFromFileMock.mockResolvedValue('liggend');
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-formaat-liggend')).toBeChecked());
    expect(detectFormaatFromFileMock).toHaveBeenCalledWith(file);

    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    expect(screen.getByTestId('kunstwerk-modal-formaat-staand')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-formaat-liggend')).not.toBeChecked();
  });

  it('leaves formaat unselected when detection fails on a new photo', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    detectFormaatFromFileMock.mockResolvedValue(null);
    renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    expect(screen.getByTestId('kunstwerk-modal-formaat-vierkant')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-formaat-liggend')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-formaat-staand')).not.toBeChecked();
  });

  it('detects formaat from the existing photo when opening a kunstwerk that has none set yet', async () => {
    detectFormaatFromImageUrlMock.mockResolvedValue('staand');
    const zonderFormaat: Kunstwerk = { ...KUNSTWERKEN[0], id: 'kw-3', formaat: undefined };
    renderSection({ kunstwerken: [...KUNSTWERKEN, zonderFormaat] });

    fireEvent.click(screen.getByTestId('data-table-row-kw-3'));

    expect(detectFormaatFromImageUrlMock).toHaveBeenCalledWith(zonderFormaat.foto);
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-formaat-staand')).toBeChecked());
  });

  it('does not preselect a detected formaat when it would conflict with already-saved maten', async () => {
    detectFormaatFromImageUrlMock.mockResolvedValue('vierkant');
    const gemengdeMaten: Kunstwerk = {
      ...KUNSTWERKEN[0],
      id: 'kw-mixed',
      formaat: undefined,
      maatIds: ['maat-1', 'maat-3'],
    };
    renderSection({ kunstwerken: [...KUNSTWERKEN, gemengdeMaten] });

    fireEvent.click(screen.getByTestId('data-table-row-kw-mixed'));
    await waitFor(() => expect(detectFormaatFromImageUrlMock).toHaveBeenCalledWith(gemengdeMaten.foto));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId('kunstwerk-modal-formaat-vierkant')).not.toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-1')).toBeChecked();
    expect(screen.getByTestId('kunstwerk-modal-maat-maat-3')).toBeChecked();
  });

  it('does not call the detector when opening a kunstwerk that already has a formaat', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    expect(detectFormaatFromImageUrlMock).not.toHaveBeenCalled();
  });

  it('ignores a stale detection result once the admin has moved on to a different kunstwerk', async () => {
    const resolvers: Array<(value: 'vierkant' | 'liggend' | 'staand' | null) => void> = [];
    detectFormaatFromImageUrlMock.mockImplementation(
      () => new Promise((resolve) => { resolvers.push(resolve); })
    );
    const kwA: Kunstwerk = { ...KUNSTWERKEN[0], id: 'kw-a', formaat: undefined, foto: 'https://storage.example.com/kw-a.jpg' };
    const kwB: Kunstwerk = { ...KUNSTWERKEN[0], id: 'kw-b', formaat: undefined, foto: 'https://storage.example.com/kw-b.jpg' };
    renderSection({ kunstwerken: [kwA, kwB] });

    fireEvent.click(screen.getByTestId('data-table-row-kw-a'));
    fireEvent.click(screen.getByTestId('data-table-row-kw-b'));

    expect(resolvers).toHaveLength(2);
    resolvers[0]('liggend');
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-naam')).toBeInTheDocument());

    expect(screen.getByTestId('kunstwerk-modal-formaat-liggend')).not.toBeChecked();

    resolvers[1]('staand');
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-formaat-staand')).toBeChecked());
  });

  it('toggles an existing stijl/onderwerp checkbox and an AI-gegenereerd checkbox into the saved payload', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    // Pick the formaat first, then narrow down to just mat-1 + maat-1: choosing a formaat
    // re-checks every materiaal and every compatible maat, so narrowing before that point
    // would just get overwritten (maat-3 is square, so it's already excluded/disabled once
    // "staand" is picked — no need to uncheck it separately).
    fireEvent.click(screen.getByTestId('kunstwerk-modal-formaat-staand'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-2'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Test omschrijving' } });

    fireEvent.click(screen.getByTestId('kunstwerk-modal-stijl-stijl-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-onderwerp-onderwerp-2'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-ai-gegenereerd'));

    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          stijlIds: ['stijl-1'],
          onderwerpIds: ['onderwerp-2'],
          aiGegenereerd: true,
        })
      )
    );
  });

  it('creates a brand-new stijl inline, adds it to the Stijlen table, and auto-selects it on the kunstwerk', async () => {
    const onAddStijl = vi.fn().mockResolvedValue(true);
    const { rerender } = renderSection({ onAddStijl });
    fireEvent.click(screen.getByTestId('kunstwerken-add'));

    fireEvent.change(screen.getByTestId('kunstwerk-modal-nieuwe-stijl-naam'), { target: { value: 'Jugendstil' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-nieuwe-stijl-toevoegen'));
    await waitFor(() => expect(onAddStijl).toHaveBeenCalledWith({ omschrijving: 'Jugendstil' }));

    // Simulate BeheerShell re-rendering this component with the freshly-refetched stijlen list,
    // the way it really would once onAddStijl's API call resolves and useApiCollection refetches.
    rerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <KunstwerkenSection
              kunstwerken={KUNSTWERKEN}
              segmenten={SEGMENTEN}
              materialen={MATERIALEN}
              materiaalsoorten={null}
              maten={MATEN}
              stijlen={[...STIJLEN, { id: 'stijl-3', omschrijving: 'Jugendstil' }]}
              onderwerpen={ONDERWERPEN}
              kunstenaars={KUNSTENAARS}
              loadError={null}
              onAdd={vi.fn().mockResolvedValue(true)}
              onUpdate={vi.fn().mockResolvedValue(true)}
              onRemove={vi.fn().mockResolvedValue(true)}
              onAddStijl={onAddStijl}
              onAddOnderwerp={vi.fn().mockResolvedValue(true)}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );

    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-stijl-stijl-3')).toBeChecked());
  });

  describe('klant-dialoog preview', () => {
    it('shows a live ProductModal preview instead of the old print-label card when the add form is open', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    });

    it('widens the preview column at the min-[1432px] breakpoint, in addition to the existing lg column', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      const grid = screen.getByTestId('kunstwerk-modal');
      expect(grid.className).toContain('lg:grid-cols-[minmax(0,1fr)_320px]');
      expect(grid.className).toContain('min-[1432px]:grid-cols-[minmax(0,1fr)_560px]');
    });

    it('updates the preview omschrijving as the admin types it', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), {
        target: { value: 'Nieuw kunstwerk in wording' },
      });
      expect(screen.getByTestId('product-modal-omschrijving')).toHaveTextContent('Nieuw kunstwerk in wording');
    });

    it('disables ordering in the preview', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    });

    it('reflects the segment checkboxes as the collectie label in the preview', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('kunstwerken-add'));
      fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
      expect(screen.getByTestId('product-modal-collecties')).toHaveTextContent('Hotel');
    });

    it('preloads the preview with the existing kunstwerk data when editing', () => {
      renderSection();
      fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
      expect(screen.getByTestId('product-modal-omschrijving')).toHaveTextContent('Hotel paneel 1');
    });
  });
});
