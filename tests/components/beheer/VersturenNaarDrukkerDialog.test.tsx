import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { VersturenNaarDrukkerDialog } from '@/components/beheer/VersturenNaarDrukkerDialog';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();
const addDocMock = vi.fn();
const logActiviteitMock = vi.fn();
const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...segments: string[]) => ({ collectionName: segments.slice(0, -1).join('/'), id: segments[segments.length - 1] })),
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  serverTimestamp: () => 'server-timestamp',
}));

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

const KLANT: Klant = {
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
};

const DRUKKERS: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
];

const KUNSTWERKEN: Kunstwerk[] = [
  { id: 'kw-1', foto: '', naam: 'Hotel paneel', artiest: '', segmentIds: [], materiaalIds: ['mat-1'], maatIds: ['maat-1'], prijzen: [], omschrijvingNl: 'Hotel paneel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const MATERIALEN: Materiaal[] = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' }];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];

const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  besteldatum: '1-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 2,
  lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof VersturenNaarDrukkerDialog>> = {}) {
  const onClose = vi.fn();
  const onVerstuurd = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <VersturenNaarDrukkerDialog
        isOpen
        onClose={onClose}
        bestellingen={[BESTELLING]}
        klanten={[KLANT]}
        drukkers={DRUKKERS}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        onVerstuurd={onVerstuurd}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onVerstuurd };
}

beforeEach(() => {
  updateDocMock.mockReset();
  addDocMock.mockReset();
  logActiviteitMock.mockReset();
  fetchMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
  vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
});

describe('VersturenNaarDrukkerDialog', () => {
  it('pre-selects the only drukker and shows the full e-mail preview', () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
    expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Hotel paneel');
  });

  it('sends the mail, updates statuses, saves a zending, logs the activiteit, and closes', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    updateDocMock.mockResolvedValue(undefined);
    addDocMock.mockResolvedValue(undefined);
    const { onVerstuurd, onClose } = renderDialog();

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/mail.php',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"to":"info@janssen.nl"'),
        })
      )
    );
    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'bestelheaders', id: 'header-1' },
        { status: 'Verstuurd naar drukker' }
      )
    );
    await waitFor(() =>
      expect(addDocMock).toHaveBeenCalledWith(
        { name: 'drukkers/drukker-1/zendingen' },
        expect.objectContaining({
          bestellingIds: ['header-1'],
          aantalKlanten: 1,
          aantalRegels: 1,
          verzondDoor: 'paul@glassartanddesign.com',
        })
      )
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_verstuurd_naar_drukker', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
    expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error and does not update anything when the mail request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { onVerstuurd } = renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'Het versturen van de e-mail is mislukt. Probeer het opnieuw.'
    );
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(onVerstuurd).not.toHaveBeenCalled();
  });

  it('shows a distinct error when the mail sends but the status update fails', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    updateDocMock.mockRejectedValue(new Error('offline'));
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'De e-mail is verzonden, maar het bijwerken van de bestellingen is mislukt. Verstuur niet opnieuw — controleer de statussen handmatig.'
    );
  });
});
