import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { VersturenNaarDrukkerDialog } from '@/components/beheer/VersturenNaarDrukkerDialog';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
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

const logActiviteitMock = vi.fn();
const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),}));

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
  kunstenaarnr: null,
};

const DRUKKERS: Drukker[] = [
  { id: 'drukker-1', drukkernr: 'DR-00005', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
];

const DRUKKERS_MET_STANDAARD: Drukker[] = [
  { id: 'drukker-1', drukkernr: 'DR-00005', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
  { id: 'drukker-2', drukkernr: 'DR-00006', naam: 'Drukkerij Tweede', adres: 'Perslaan 2', postcode: '1000 AB', plaats: 'Utrecht', email: 'info@tweede.nl', prijsafspraken: '', standaard: true },
];

const KUNSTWERKEN: Kunstwerk[] = [
  { id: 'kw-1', foto: 'https://example.com/hotel-paneel.jpg', code: 'Hotel paneel', kunstenaarnr: null, segmentIds: [], materiaalIds: ['mat-1'], maatIds: ['maat-1'], omschrijvingNl: 'Hotel paneel', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
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
  lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
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
  lines: [{ id: 'line-2', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
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

// Renders and waits for the bedrijfsgegevens fetch to resolve, so `mail` is
// populated and Versturen is only disabled for reasons the test cares about
// (not the transient loading window every test would otherwise race against).
async function renderReadyDialog(overrides: Partial<React.ComponentProps<typeof VersturenNaarDrukkerDialog>> = {}) {
  const result = renderDialog(overrides);
  await waitFor(() => expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV'));
  return result;
}

function zendingCall() {
  return fetchMock.mock.calls.find((call) => (call[0] as string) === '/api/drukkers/drukker-1/zendingen');
}

function statusCallFor(headerId: string) {
  return fetchMock.mock.calls.find((call) => (call[0] as string) === `/api/bestelheaders/${headerId}`);
}

function mailCallPayload() {
  const call = fetchMock.mock.calls.find((call) => (call[0] as string) === '/api/mail');
  return call ? JSON.parse((call[1] as { body: string }).body) : undefined;
}

function defaultFetchImplementation(url: string) {
  if (url === '/api/mail') return { ok: true };
  if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
  if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
  if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
  return { ok: true, json: async () => ({ ok: true }) };
}

beforeEach(() => {
  logActiviteitMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetchImplementation(url));
});

describe('VersturenNaarDrukkerDialog', () => {
  it('pre-selects the only drukker and shows the full e-mail preview, including a line thumbnail', async () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
    await waitFor(() => expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV'));
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

  it('shows the mail subject without a zendingnummer in the preview, with a note that one is assigned on send', async () => {
    await renderReadyDialog();
    const onderwerpRegel = screen.getByTestId('drukker-versturen-onderwerp');
    expect(onderwerpRegel).toHaveTextContent('Nieuwe order(s) voor de drukker');
    expect(onderwerpRegel).toHaveTextContent('zendingnummer wordt toegekend bij verzenden');
    expect(onderwerpRegel).not.toHaveTextContent('ZD-');
  });

  it('reserves a zendingnummer before sending, and prefixes the mail subject, archive onderwerp, and status-updates with it', async () => {
    const { onVerstuurd } = await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/drukkers/drukker-1/zendingen/nummer',
        expect.objectContaining({ method: 'POST' })
      )
    );
    await waitFor(() => expect(mailCallPayload()).toBeDefined());
    expect(mailCallPayload().subject).toMatch(/^ZD-00001 — Nieuwe order\(s\) voor de drukker/);

    await waitFor(() => expect(zendingCall()).toBeDefined());
    const zendingBody = JSON.parse((zendingCall()![1] as { body: string }).body);
    expect(zendingBody.zendingnummer).toBe('ZD-00001');
    expect(zendingBody.onderwerp).toMatch(/^ZD-00001 — /);

    await waitFor(() => expect(statusCallFor('header-1')).toBeDefined());
    expect(JSON.parse((statusCallFor('header-1')![1] as { body: string }).body)).toEqual({
      status: 'Verstuurd naar drukker',
      zendingnummer: 'ZD-00001',
    });

    await waitFor(() =>
      expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker', zendingnummer: 'ZD-00001' }])
    );
  });

  it('shows the mail error and never sends when reserving a zendingnummer fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: false };
      return defaultFetchImplementation(url);
    });
    await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'Het versturen van de e-mail is mislukt. Probeer het opnieuw.'
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/api/mail', expect.anything());
  });

  it('sends the mail with both a plain-text and an html body, including the Glassart & Design invoice footer, updates statuses, saves a zending, logs the activiteit, and closes', async () => {
    const { onVerstuurd, onClose } = await renderReadyDialog();

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/mail', expect.objectContaining({ method: 'POST' }))
    );
    // Geen `to` en geen secret in de payload: /api/mail zoekt het adres zelf bij
    // drukkerId op, zodat de relay niet vanaf de client te richten is.
    expect(mailCallPayload()).toMatchObject({
      soort: 'drukker',
      drukkerId: 'drukker-1',
      subject: expect.stringContaining('Nieuwe order(s) voor de drukker'),
      body: expect.stringContaining('Testbedrijf BV'),
      html: expect.stringContaining('<img src="https://example.com/hotel-paneel.jpg"'),
    });
    expect(mailCallPayload().body).toContain(BEDRIJFSGEGEVENS_SEED.bezoekadres);
    expect(mailCallPayload().html).toContain(BEDRIJFSGEGEVENS_SEED.kvkNummer);
    await waitFor(() =>
      expect(statusCallFor('header-1')).toEqual([
        '/api/bestelheaders/header-1',
        expect.objectContaining({ method: 'PATCH' }),
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
      'GD-00201'
    );
    expect(onVerstuurd).toHaveBeenCalledWith([{ ...BESTELLING, status: 'Verstuurd naar drukker', zendingnummer: 'ZD-00001' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('joins bestelnummers with a comma when sending a batch of multiple bestellingen', async () => {
    await renderReadyDialog({ bestellingen: [BESTELLING, BESTELLING_2] });

    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_verstuurd_naar_drukker',
        'GD-00201, GD-00202'
      )
    );
  });

  it('shows an error and does not update anything when the mail request fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/mail') return { ok: false };
      return defaultFetchImplementation(url);
    });
    const { onVerstuurd } = await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'Het versturen van de e-mail is mislukt. Probeer het opnieuw.'
    );
    expect(statusCallFor('header-1')).toBeUndefined();
    expect(onVerstuurd).not.toHaveBeenCalled();
  });

  it('shows a distinct error when the mail sends but the status update fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/mail') return { ok: true };
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
      if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      return { ok: false };
    });
    await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));
    expect(await screen.findByTestId('drukker-versturen-error')).toHaveTextContent(
      'De e-mail is verzonden, maar het bijwerken van de bestellingen is mislukt. Verstuur niet opnieuw — controleer de statussen handmatig.'
    );
  });

  it('saves the zending archive record before updating the bestelling statuses', async () => {
    const callOrder: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/mail') return { ok: true };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
      if (url === '/api/drukkers/drukker-1/zendingen') {
        callOrder.push('zending');
        return { ok: true, json: async () => ({ ok: true }) };
      }
      callOrder.push('status');
      return { ok: true, json: async () => ({ ok: true }) };
    });
    await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(callOrder).toContain('status'));
    expect(callOrder).toEqual(['zending', 'status']);
  });

  it('archives the zending even when the subsequent status update fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/mail') return { ok: true };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
      if (url === '/api/drukkers/drukker-1/zendingen') return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false };
    });
    await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await screen.findByTestId('drukker-versturen-error');
    expect(zendingCall()).toBeDefined();
  });

  it('disables Versturen once a mail has been sent, even if the dialog stays open, preventing a duplicate send', async () => {
    await renderReadyDialog();
    const versturenButton = screen.getByTestId('drukker-versturen-versturen');
    fireEvent.click(versturenButton);

    await waitFor(() => expect(statusCallFor('header-1')).toBeDefined());
    await waitFor(() => expect(versturenButton).toBeDisabled());

    fireEvent.click(versturenButton);
    expect(fetchMock.mock.calls.filter((call) => (call[0] as string) !== '/api/instellingen/bedrijfsgegevens')).toHaveLength(4);
  });

  it('disables Versturen as soon as the mail POST succeeds, before the zending/status writes settle', async () => {
    let resolveZending: () => void = () => {};
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/mail') return { ok: true };
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
      if (url === '/api/drukkers/drukker-1/zendingen') {
        return new Promise((resolve) => {
          resolveZending = () => resolve({ ok: true, json: async () => ({ ok: true }) });
        });
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    await renderReadyDialog();
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
  });

  it('disables Versturen and shows an error when the bedrijfsgegevens fail to load', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: false };
      return defaultFetchImplementation(url);
    });
    renderDialog();
    await waitFor(() => expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled());
    expect(screen.getByTestId('drukker-versturen-bedrijfsgegevens-fout')).toHaveTextContent(
      'Bedrijfsgegevens van Glassart & Design konden niet worden geladen — kan niet verstuurd worden.'
    );
  });

  it('does not disable Versturen or show the klant-ontbreken message when all klanten are present', async () => {
    await renderReadyDialog();
    expect(screen.queryByTestId('drukker-versturen-klant-ontbreekt')).not.toBeInTheDocument();
    expect(screen.getByTestId('drukker-versturen-versturen')).not.toBeDisabled();
  });

  it('cannot be dismissed via Annuleren while a send is in flight', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/instellingen/bedrijfsgegevens') return { ok: true, json: async () => BEDRIJFSGEGEVENS_SEED };
      if (url === '/api/drukkers/drukker-1/zendingen/nummer') return { ok: true, json: async () => ({ zendingnummer: 'ZD-00001' }) };
      if (url === '/api/mail') return { ok: true };
      return new Promise(() => {});
    });
    const { onClose } = await renderReadyDialog();
    fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

    await waitFor(() => expect(screen.getByTestId('drukker-versturen-annuleren')).toBeDisabled());
    fireEvent.click(screen.getByTestId('drukker-versturen-annuleren'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the required-field legend', () => {
    renderDialog();
    expect(screen.getByTestId('drukker-versturen-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });

  describe('onvolledige klantgegevens', () => {
    // De adreskolommen zijn NULLABLE in db/schema.sql terwijl Klant ze als
    // verplichte string typeert. Voorheen ging zo'n klant gewoon mee en kwam er
    // "Afleveradres: null, null null" bij de drukker aan.
    it('blocks sending and names the klant plus the missing fields', async () => {
      const zonderAdres = { ...KLANT, address: null, city: null } as unknown as Klant;
      renderDialog({ klanten: [zonderAdres] });

      const melding = await screen.findByTestId('drukker-versturen-klant-onvolledig');
      expect(melding).toHaveTextContent('Testbedrijf BV');
      expect(melding).toHaveTextContent('adres');
      expect(melding).toHaveTextContent('plaats');
      expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    });

    it('checks the delivery fields once a delivery address is filled in', async () => {
      const halfAfleveradres = { ...KLANT, deliveryAddress: 'Havenweg 5' } as Klant;
      renderDialog({ klanten: [halfAfleveradres] });

      const melding = await screen.findByTestId('drukker-versturen-klant-onvolledig');
      expect(melding).toHaveTextContent('afleverpostcode');
      expect(melding).toHaveTextContent('afleverplaats');
      expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    });

    it('falls back to a readable label for a klant without a bedrijfsnaam', async () => {
      const naamloos = { ...KLANT, companyName: '' } as Klant;
      renderDialog({ klanten: [naamloos] });

      expect(await screen.findByTestId('drukker-versturen-klant-onvolledig')).toHaveTextContent(
        'Klant zonder bedrijfsnaam'
      );
    });

    it('names only the incomplete klant when the selection mixes complete and incomplete ones', async () => {
      // Bestellingen van meerdere klanten combineren is een ondersteund
      // scenario, dus de opsomming mag de complete klant niet noemen.
      const onvolledig = { ...KLANT, id: 'uid-2', companyName: 'Ander Bedrijf', city: null } as unknown as Klant;
      renderDialog({
        bestellingen: [BESTELLING, { ...BESTELLING, id: 'header-9', klantId: 'uid-2' }],
        klanten: [KLANT, onvolledig],
      });

      const melding = await screen.findByTestId('drukker-versturen-klant-onvolledig');
      expect(melding).toHaveTextContent('Ander Bedrijf');
      expect(melding).not.toHaveTextContent('Testbedrijf BV');
      expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    });

    it('does not complain when every klant is complete', async () => {
      await renderReadyDialog();
      expect(screen.queryByTestId('drukker-versturen-klant-onvolledig')).not.toBeInTheDocument();
      expect(screen.getByTestId('drukker-versturen-versturen')).not.toBeDisabled();
    });
  });

  describe('onvolledige bedrijfsgegevens', () => {
    // Het Bedrijfsgegevens-type belooft tien verplichte strings, maar de data
    // komt als losse JSON-blob uit `instellingen` en wordt nergens gevalideerd.
    // Een record dat bestaat maar velden mist is dus een reële situatie --
    // zeker sinds de seeds weg zijn en niets die gaten meer opvult.
    function mockOnvolledig(ontbrekend: Partial<Record<string, undefined>>) {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === '/api/instellingen/bedrijfsgegevens') {
          return { ok: true, json: async () => ({ ...BEDRIJFSGEGEVENS_SEED, ...ontbrekend }) };
        }
        return { ok: true, json: async () => ({}) };
      });
    }

    it('blocks sending and names the missing field instead of mailing a blank factuurvoetje', async () => {
      mockOnvolledig({ kvkNummer: undefined });
      renderDialog();

      const melding = await screen.findByTestId('drukker-versturen-bedrijfsgegevens-onvolledig');
      expect(melding).toHaveTextContent('KVK-nummer');
      expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    });

    it('lists every missing field, not just the first', async () => {
      mockOnvolledig({ kvkNummer: undefined, btwNummer: undefined });
      renderDialog();

      const melding = await screen.findByTestId('drukker-versturen-bedrijfsgegevens-onvolledig');
      expect(melding).toHaveTextContent('KVK-nummer');
      expect(melding).toHaveTextContent('btw-nummer');
    });

    it('treats a blank value the same as an absent one', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === '/api/instellingen/bedrijfsgegevens') {
          return { ok: true, json: async () => ({ ...BEDRIJFSGEGEVENS_SEED, bezoekadres: '   ' }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      renderDialog();

      expect(await screen.findByTestId('drukker-versturen-bedrijfsgegevens-onvolledig')).toHaveTextContent('bezoekadres');
      expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    });

    it('explains that the record is missing entirely instead of leaving a dead grey button', async () => {
      // useApiRecord mapt een 404 op data: null, error: null -- zonder aparte
      // melding zag de medewerker alleen een uitgeschakelde knop.
      fetchMock.mockImplementation(async (url: string) => {
        if (url === '/api/instellingen/bedrijfsgegevens') return { ok: false, status: 404 };
        return { ok: true, json: async () => ({}) };
      });
      renderDialog();

      expect(await screen.findByTestId('drukker-versturen-bedrijfsgegevens-ontbreekt')).toBeInTheDocument();
      expect(screen.getByTestId('drukker-versturen-versturen')).toBeDisabled();
    });

    it('does not complain when the record is complete', async () => {
      await renderReadyDialog();
      expect(screen.queryByTestId('drukker-versturen-bedrijfsgegevens-onvolledig')).not.toBeInTheDocument();
      expect(screen.getByTestId('drukker-versturen-versturen')).not.toBeDisabled();
    });
  });
});
