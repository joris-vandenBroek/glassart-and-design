import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KunstwerkenSection } from '@/components/beheer/KunstwerkenSection';
import type { Kunstwerk, Segment, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import messages from '../../../messages/nl.json';

const uploadMock = vi.fn();
let mockUploading = false;
let mockUploadError: 'upload' | null = null;

vi.mock('@/lib/useKunstwerkFotoUpload', () => ({
  useKunstwerkFotoUpload: () => ({ uploading: mockUploading, error: mockUploadError, upload: uploadMock }),
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
    prijsafspraken: '',
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
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KunstwerkenSection
        kunstwerken={KUNSTWERKEN}
        segmenten={SEGMENTEN}
        materialen={MATERIALEN}
        maten={MATEN}
        kunstenaars={KUNSTENAARS}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove };
}

beforeEach(() => {
  uploadMock.mockReset();
  mockUploading = false;
  mockUploadError = null;
  logActiviteitMock.mockReset();
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
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
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
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-2'));
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-2-maat-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    expect(screen.queryByTestId('kunstwerk-modal-prijs-mat-1-maat-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('kunstwerk-modal-prijs-mat-2-maat-1')).toBeInTheDocument();
  });

  it('adds a new kunstwerk with the uploaded photo, selections, prices and NL description', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstwerken-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstwerk-modal-foto-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('kunstwerk-modal-segment-seg-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
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
        segmentIds: ['seg-1'],
        materiaalIds: ['mat-1'],
        maatIds: ['maat-1'],
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

    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('kw-1', {
        foto: 'https://storage.example.com/kw-1.jpg',
        naam: 'Hotel paneel 1',
        kunstenaarId: null,
        segmentIds: ['seg-1'],
        materiaalIds: ['mat-1'],
        maatIds: ['maat-1'],
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
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs kunstwerk_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '175' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs kunstwerk_verwijderd with the logged-in medewerker when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-kw-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-verwijderen'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_verwijderd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
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
    fireEvent.click(screen.getByTestId('kunstwerk-modal-materiaal-mat-1'));
    fireEvent.click(screen.getByTestId('kunstwerk-modal-maat-maat-1'));
    fireEvent.change(screen.getByTestId('kunstwerk-modal-naam'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-prijs-mat-1-maat-1'), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('kunstwerk-modal-omschrijving-nl'), { target: { value: 'Nieuw kunstwerk' } });
    fireEvent.click(screen.getByTestId('kunstwerk-modal-opslaan'));

    await screen.findByTestId('kunstwerk-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
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
  });

  it('does not show the backfill button when every kunstwerk already has a naam', () => {
    renderSection();
    expect(screen.queryByTestId('kunstwerken-backfill-namen')).not.toBeInTheDocument();
  });
});
