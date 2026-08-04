import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { VersturenNaarDrukkerDialog } from '@/components/beheer/VersturenNaarDrukkerDialog';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();
const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

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
  kunstenaarId: null,
};

const DRUKKERS: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
];

const DRUKKERS_MET_STANDAARD: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
  { id: 'drukker-2', naam: 'Drukkerij Tweede', adres: 'Perslaan 2', postcode: '1000 AB', plaats: 'Utrecht', email: 'info@tweede.nl', prijsafspraken: '', standaard: true },
];

const KUNSTWERKEN: Kunstwerk[] = [
  { id: 'kw-1', foto: 'https://example.com/hotel-paneel.jpg', naam: 'Hotel paneel', kunstenaarId: null, segmentIds: [], materiaalIds: ['mat-1'], maatIds: ['maat-1'], omschrijvingNl: 'Hotel paneel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const MATERIALEN: Materiaal[] = [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 6, omschrijving: 'Helder' }];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Glas' }];

const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00201',
  besteldatum: '1-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 2,
  lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
};

const BESTELLING_2: Bestelling = {
  id: 'header-2',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00202',
  besteldatum: '2-7-2026',
  status: 'Te versturen naar drukker',
  lineCount: 1,
  totalQuantity: 1,
  lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
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

function zendingCall() {
  return fetchMock.mock.calls.find((call) => (call[0] as string) === '/api/drukkers/drukker-1/zendingen');
}

function statusCallFor(headerId: string) {
  return fetchMock.mock.calls.find((call) => (call[0] as string) === `/api/bestelheaders/${headerId}`);
}

function mailCallPayload() {
  const call = fetchMock.mock.calls.find((call) => (call[0] as string) === 'https://example.com/mail.php');
  return call ? JSON.parse((call[1] as { body: string }).body) : undefined;
}

beforeEach(() => {
  logActiviteitMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === 'https://example.com/mail.php') return { ok: true };
    if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => ({ ok: true }) };
  });
  vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
  vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
});

describe('VersturenNaarDrukkerDialog', () => {
  it('pre-selects the only drukker and shows the full e-mail preview, including a line thumbnail', () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
    expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Hotel paneel');
    expect(screen.getByTestId('drukker-versturen-preview').querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/hotel-paneel.jpg'
    );
  });

  it('pre-selects the standaard drukker when multiple drukkers exist', () => {
    renderDialog({ drukkers: DRUKKERS_MET_STANDAARD });
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-2');
  });

  it('falls back to the first drukker when none is marked standaard', () => {
    renderDialog({
      drukkers: DRUKKERS_MET_STANDAARD.map((drukker) => ({ ...drukker, standaard: false })),
    });
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
  });

  it('sends the mail with both a plain-text and an html body, updates statuses, saves a zending, logs the activiteit, and closes', async () => {
    const { onVerstuurd, onClose } = renderDialog();

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/mail.php', expect.objectContaining({ method: 'POST' }))
    );
    expect(mailCallPayload()).toMatchObject({
      to: 'info@janssen.nl',
      subject: expect.stringContaining('Nieuwe order(s) voor de drukker'),
      body: expect.stringContaining('Testbedrijf BV'),
      html: expect.stringContaining('<img src="https://example.com/hotel-paneel.jpg"'),
    });
    await waitFor(() =>
      expect(statusCallFor('header-1')).toEqual([
        '/api/bestelheaders/header-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Verstuurd naar drukker' }) }),
      ])
    );
    await waitFor(() => expect(zendingCall()).toBeDefined());
    expect(JSON.parse((zendingCall()![1] as { body: string }).body)).toMatchObject({
      bestellingIds: ['header-1'],
      aantalKlanten: 1,
      aantalRegels: 1,
      verzondDoor: 'paul@glassartanddesign.com',
    });
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_verstuurd_naar_drukker',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00201'
    );
    expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('joins bestelnummers with a comma when sending a batch of multiple bestellingen', async () => {
    renderDialog({ bestellingen: [BESTELLING, BESTELLING_2] });

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_verstuurd_naar_drukker',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'GD-00201, GD-00202'
      )
    );
  });

  it('shows an error and does not update anything when the mail request fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: false };
      return { ok: true, json: async () => ({ ok: true }) };
    });
    const { onVerstuurd } = renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'Het versturen van de e-mail is mislukt. Probeer het opnieuw.'
    );
    expect(statusCallFor('header-1')).toBeUndefined();
    expect(onVerstuurd).not.toHaveBeenCalled();
  });

  it('shows a distinct error when the mail sends but the status update fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false };
    });
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'De e-mail is verzonden, maar het bijwerken van de bestellingen is mislukt. Verstuur niet opnieuw — controleer de statussen handmatig.'
    );
  });

  it('saves the zending archive record before updating the bestelling statuses', async () => {
    const callOrder: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/drukkers/drukker-1/zendingen') {
        callOrder.push('zending');
        return { ok: true, json: async () => ({ ok: true }) };
      }
      callOrder.push('status');
      return { ok: true, json: async () => ({ ok: true }) };
    });
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(callOrder).toContain('status'));
    expect(callOrder).toEqual(['zending', 'status']);
  });

  it('archives the zending even when the subsequent status update fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false };
    });
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await screen.findByTestId('drukker-versturen-error');
    expect(zendingCall()).toBeDefined();
  });

  it('disables Versturen once a mail has been sent, even if the dialog stays open, preventing a duplicate send', async () => {
    renderDialog();
    const versturenButton = screen.getByTestId('drukker-versturen-versturen');
    fireEvent.click(versturenButton);

    await waitFor(() => expect(statusCallFor('header-1')).toBeDefined());
    await waitFor(() => expect(versturenButton).toBeDisabled());

    fireEvent.click(versturenButton);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('disables Versturen as soon as the mail POST succeeds, before the zending/status writes settle', async () => {
    let resolveZending: () => void = () => {};
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/mail.php') return { ok: true };
      if (url === '/api/drukkers/drukker-1/zendingen') {
        return new Promise((resolve) => {
          resolveZending = () => resolve({ ok: true, json: async () => ({ ok: true }) });
        });
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled());
    resolveZending();
  });

  it('disables Versturen and shows a message when a selected bestelling has no matching klant', () => {
    renderDialog({ klanten: [] });
    expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    expect(screen.getByTestId('drukker-versturen-klant-ontbreekt')).toHaveTextContent(
      'Klantgegevens ontbreken voor 1 bestelling(en) — kan niet verstuurd worden.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not disable Versturen or show the klant-ontbreken message when all klanten are present', () => {
    renderDialog();
    expect(screen.queryByTestId('drukker-versturen-klant-ontbreekt')).not.toBeInTheDocument();
    expect(screen.getByTestId('drukker-versturen-versturen')).not.toBeDisabled();
  });

  it('cannot be dismissed via Annuleren while a send is in flight', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(screen.getByTestId('drukker-versturen-annuleren')).toBeDisabled());
    fireEvent.click(screen.getByTestId('drukker-versturen-annuleren'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the required-field legend', () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
