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
    status: 'Goedgekeurd',
    prijsgroepId: null,
    exclusieveKunstenaarIds: [],
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
    prijsafspraken: '20% commissie',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: null,
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof KunstenaarsSection>> = {}) {
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(true);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(true);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KunstenaarsSection
        kunstenaars={KUNSTENAARS}
        klanten={KLANTEN}
        kunstwerken={[]}
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

describe('KunstenaarsSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('kunstenaars-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while kunstenaars is null and there is no error', () => {
    renderSection({ kunstenaars: null });
    expect(screen.queryByTestId('kunstenaars-section')).not.toBeInTheDocument();
  });

  it('lists kunstenaars with their verkooprecht label', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Sabrina Glasser');
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Open voor alle klanten');
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

  it('adds a new kunstenaar with an uploaded photo, verkooprecht and gekoppelde klant', async () => {
    uploadMock.mockResolvedValue('https://storage.example.com/nieuw.jpg');
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-foto-input'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('kunstenaar-modal-foto-preview')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'Nieuwe Kunstenaar' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Werkt met glas.' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-verkooprecht'), { target: { value: 'alleen-kunstenaar' } });
    fireEvent.focus(screen.getByTestId('kunstenaar-modal-klant'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-klant-option-klant-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        foto: 'https://storage.example.com/nieuw.jpg',
        naam: 'Nieuwe Kunstenaar',
        omschrijvingNl: 'Werkt met glas.',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        prijsafspraken: '',
        verkooprecht: 'alleen-kunstenaar',
        klantId: 'klant-1',
        exclusiefVoorKlantId: null,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('kunstenaar_toegevoegd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('opens a row for editing pre-filled and updates it, preserving exclusiefVoorKlantId', async () => {
    const { onUpdate } = renderSection({
      kunstenaars: [{ ...KUNSTENAARS[0], exclusiefVoorKlantId: 'klant-1' }],
    });
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    expect(screen.getByTestId('kunstenaar-modal-naam')).toHaveValue('Sabrina Glasser');
    expect(screen.getByTestId('kunstenaar-modal-prijsafspraken')).toHaveValue('20% commissie');

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
        prijsafspraken: '20% commissie',
        verkooprecht: 'open',
        klantId: null,
        exclusiefVoorKlantId: 'klant-1',
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('kunstenaar_gewijzigd', expect.anything());
  });

  it('deletes a kunstenaar and logs kunstenaar_verwijderd', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ka-1'));
    fireEvent.click(screen.getByTestId('kunstenaar-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ka-1'));
    expect(logActiviteitMock).toHaveBeenCalledWith('kunstenaar_verwijderd', expect.anything());
  });

  it('shows an action error and does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('kunstenaars-add'));
    fireEvent.change(screen.getByTestId('kunstenaar-modal-naam'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('kunstenaar-modal-omschrijving-nl'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByTestId('kunstenaar-modal-opslaan'));
    expect(await screen.findByTestId('kunstenaar-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
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
});
