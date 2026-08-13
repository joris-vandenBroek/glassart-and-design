import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KlantModal } from '@/components/beheer/KlantModal';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Prijsgroep } from '@/components/beheer/materiaalTypes';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
const logActiviteitMock = vi.fn();
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
  btwNummer: 'NL123456789B01',
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
  land: 'NL',
  invoiceLand: '',
  status: 'Beoordelen',
  prijsgroepId: null,
  kunstenaarnr: null,
};

const ANDERE_KLANT: Klant = { ...KLANT, id: 'uid-2', companyName: 'Ander Bedrijf BV', kunstenaarnr: 'KU-00002' };

const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0, opslagpercentage: null },
  { id: 'pg-2', naam: 'Premium', kortingspercentage: 10, opslagpercentage: null },
];

const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    kunstenaarnr: 'KU-00001',
    naam: 'Sabrina Glasser',
    foto: null,
    website: null,
    omschrijvingNl: 'Werkt met glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: [],
  },
  {
    id: 'ka-2',
    kunstenaarnr: 'KU-00002',
    naam: 'Bram Steen',
    foto: null,
    website: null,
    omschrijvingNl: 'Werkt met steen.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: ['uid-2'],
  },
];

const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };

function renderModal(
  klant: Klant | null,
  prijsgroepen: Prijsgroep[] | null = PRIJSGROEPEN,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS,
  klanten: Klant[] | null = [KLANT, ANDERE_KLANT],
  btwTarieven: BtwTarieven | null = BTWTARIEVEN,
  btwLoadError = false
) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const { rerender } = render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal
        klant={klant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        klanten={klanten}
        btwTarieven={btwTarieven}
        btwLoadError={btwLoadError}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated, rerender };
}

function patchCall() {
  return fetchMock.mock.calls.find((call) => call[0] === '/api/klanten/uid-1');
}

function patchBody() {
  const call = patchCall();
  return call ? JSON.parse((call[1] as { body: string }).body) : undefined;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  logActiviteitMock.mockReset();
});

describe('KlantModal', () => {
  it('renders nothing when klant is null', () => {
    renderModal(null);
    expect(screen.queryByTestId('klant-modal')).not.toBeInTheDocument();
  });

  it('shows the klant details and pre-selects the prijsgroep dropdown', () => {
    renderModal({ ...KLANT, prijsgroepId: 'pg-1' });
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('12345678');
    expect(screen.getByTestId('klant-modal-prijsgroep')).toHaveValue('pg-1');
  });

  it('shows the btwNummer', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('NL123456789B01');
  });

  it('saves an edited btwNummer in normalised form', async () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-btwNummer'), {
      target: { value: 'nl 9876.543.21 b02' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody().btwNummer).toBe('NL987654321B02');
  });

  it('refuses to save a btwNummer that does not match the country format', async () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-btwNummer'), {
      target: { value: 'BE0411905847' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    expect(await screen.findByTestId('klant-modal-error')).toHaveTextContent(
      'Dit btw-nummer heeft niet het juiste formaat voor het gekozen land.'
    );
    expect(patchCall()).toBeUndefined();
  });

  it('saves an existing EU klant whose btwNummer is still empty', async () => {
    renderModal({ ...KLANT, land: 'BE', btwNummer: '' });
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-phone'), { target: { value: '+3211223344' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    await waitFor(() => expect(patchCall()).toBeDefined());
  });

  it('still blocks the save when land changes to a country the stored btwNummer does not match', async () => {
    renderModal(KLANT); // NL123456789B01 / land NL, both valid until land changes below
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.focus(screen.getByTestId('klant-modal-land'));
    fireEvent.click(screen.getByTestId('klant-modal-land-option-BE'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    expect(await screen.findByTestId('klant-modal-error')).toHaveTextContent(
      'Dit btw-nummer heeft niet het juiste formaat voor het gekozen land.'
    );
    expect(patchCall()).toBeUndefined();
  });

  it('does not block a save that touches neither btwNummer nor land, even with a mismatched stored pair', async () => {
    renderModal({ ...KLANT, land: 'BE', btwNummer: 'NL123456789B01', status: 'Goedgekeurd', prijsgroepId: 'pg-1' });
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    await waitFor(() => expect(patchCall()).toBeDefined());
  });

  it('shows the required-field legend', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });

  it('disables Goedkeuren until a prijsgroep is selected', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-goedkeuren')).toBeDisabled();
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-1' } });
    expect(screen.getByTestId('klant-modal-goedkeuren')).not.toBeDisabled();
  });

  it('hides the Goedkeuren button when the klant is already Goedgekeurd', () => {
    renderModal({ ...KLANT, status: 'Goedgekeurd', prijsgroepId: 'pg-1' });
    expect(screen.queryByTestId('klant-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal-afwijzen')).toBeInTheDocument();
  });

  it('saves a changed prijsgroep via the single Opslaan button once Goedgekeurd', async () => {
    const { onUpdated } = renderModal({ ...KLANT, status: 'Goedgekeurd', prijsgroepId: 'pg-1' });
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ prijsgroepId: 'pg-2' });
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        ...KLANT,
        status: 'Goedgekeurd',
        prijsgroepId: 'pg-2',
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_prijsgroep_gewijzigd',
      'Testbedrijf BV'
    );
  });

  it('does not persist a changed prijsgroep while still Beoordelen', async () => {
    renderModal({ ...KLANT, status: 'Beoordelen' });
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(patchCall()).toBeUndefined();
  });

  it('pre-fills the minimale afname override input from klant.minimaleAfname', () => {
    renderModal({ ...KLANT, minimaleAfname: 7 });
    expect(screen.getByTestId('klant-modal-minimale-afname')).toHaveValue(7);
  });

  it('shows an empty minimale afname input when the klant has no override', () => {
    renderModal({ ...KLANT, minimaleAfname: null });
    expect(screen.getByTestId('klant-modal-minimale-afname')).toHaveValue(null);
  });

  it('shows the minimale afname override input even for a klant still "Beoordelen"', () => {
    renderModal({ ...KLANT, status: 'Beoordelen' });
    expect(screen.getByTestId('klant-modal-minimale-afname')).toBeInTheDocument();
  });

  it('saves the minimale afname override and logs klant_minimale_afname_gewijzigd', async () => {
    const { onUpdated } = renderModal({ ...KLANT, minimaleAfname: null });
    fireEvent.change(screen.getByTestId('klant-modal-minimale-afname'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ minimaleAfname: 6 });
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_minimale_afname_gewijzigd',
      'Testbedrijf BV'
    );
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ minimaleAfname: 6 }));
  });

  it('clears the override to null when saving an empty value', async () => {
    renderModal({ ...KLANT, minimaleAfname: 6 });
    fireEvent.change(screen.getByTestId('klant-modal-minimale-afname'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ minimaleAfname: null });
  });

  it('clamps a saved override below 1 up to 1', async () => {
    renderModal({ ...KLANT, minimaleAfname: null });
    fireEvent.change(screen.getByTestId('klant-modal-minimale-afname'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ minimaleAfname: 1 });
  });

  it('keeps the other fields read-only until Bewerken is clicked', () => {
    renderModal(KLANT);
    expect(screen.queryByTestId('klant-modal-companyName')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Testbedrijf BV');
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    expect(screen.getByTestId('klant-modal-companyName')).toHaveValue('Testbedrijf BV');
  });

  it('saves all edited fields via Opslaan and exits edit mode', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-contactPerson'), { target: { value: 'Piet Pietersen' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({
      companyName: 'Testbedrijf BV',
      kvk: '12345678',
      btwNummer: 'NL123456789B01',
      contactPerson: 'Piet Pietersen',
      contactPreference: 'email',
      email: 'jan@example.com',
      phone: '0612345678',
      address: 'Teststraat 1',
      postcode: '1234 AB',
      city: 'Teststad',
      deliveryAddress: '',
      deliveryPostcode: '',
      deliveryCity: '',
      invoiceAddress: '',
      invoicePostcode: '',
      invoiceCity: '',
      land: 'NL',
      invoiceLand: '',
    });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, contactPerson: 'Piet Pietersen' }));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_gewijzigd',
      'Testbedrijf BV'
    );
    expect(screen.queryByTestId('klant-modal-companyName')).not.toBeInTheDocument();
  });

  it('shows "Gebruikt standaardadres" for afleveradres en factuuradres when both are empty', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-afleveradres-leeg')).toHaveTextContent('Gebruikt standaardadres');
    expect(screen.getByTestId('klant-modal-factuuradres-leeg')).toHaveTextContent('Gebruikt standaardadres');
  });

  it('shows the afleveradres fields read-only when set, instead of the "gebruikt standaardadres" label', () => {
    renderModal({ ...KLANT, deliveryAddress: 'Havenweg 5', deliveryPostcode: '5678 CD', deliveryCity: 'Havenstad' });
    expect(screen.queryByTestId('klant-modal-afleveradres-leeg')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Havenweg 5');
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Havenstad');
  });

  it('edits and saves the afleveradres and factuuradres fields via Opslaan', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-deliveryAddress'), { target: { value: 'Havenweg 5' } });
    fireEvent.change(screen.getByTestId('klant-modal-deliveryPostcode'), { target: { value: '5678 CD' } });
    fireEvent.change(screen.getByTestId('klant-modal-deliveryCity'), { target: { value: 'Havenstad' } });
    fireEvent.change(screen.getByTestId('klant-modal-invoiceAddress'), { target: { value: 'Factuurlaan 9' } });
    fireEvent.change(screen.getByTestId('klant-modal-invoicePostcode'), { target: { value: '9999 ZZ' } });
    fireEvent.change(screen.getByTestId('klant-modal-invoiceCity'), { target: { value: 'Factuurstad' } });
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({
      companyName: 'Testbedrijf BV',
      kvk: '12345678',
      btwNummer: 'NL123456789B01',
      contactPerson: 'Jan Jansen',
      contactPreference: 'email',
      email: 'jan@example.com',
      phone: '0612345678',
      address: 'Teststraat 1',
      postcode: '1234 AB',
      city: 'Teststad',
      deliveryAddress: 'Havenweg 5',
      deliveryPostcode: '5678 CD',
      deliveryCity: 'Havenstad',
      invoiceAddress: 'Factuurlaan 9',
      invoicePostcode: '9999 ZZ',
      invoiceCity: 'Factuurstad',
      land: 'NL',
      invoiceLand: '',
    });
    expect(onUpdated).toHaveBeenCalled();
  });

  it('discards edits when Annuleren is clicked', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-contactPerson'), { target: { value: 'Gewijzigd' } });
    fireEvent.click(screen.getByTestId('klant-modal-annuleren'));
    expect(screen.queryByTestId('klant-modal-companyName')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Jan Jansen');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists every prijsgroep as a dropdown option', () => {
    renderModal(KLANT);
    const options = screen.getByTestId('klant-modal-prijsgroep').querySelectorAll('option');
    expect(Array.from(options).map((option) => option.textContent)).toEqual(
      expect.arrayContaining(['Standaard', 'Premium'])
    );
  });

  it('approves the klant and calls onUpdated with the updated klant', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ status: 'Goedgekeurd', prijsgroepId: 'pg-2' });
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        ...KLANT,
        status: 'Goedgekeurd',
        prijsgroepId: 'pg-2',
        klantnr: null,
      })
    );
  });

  it('toont het klantnummer in de kop wanneer de klant er een heeft', () => {
    renderModal({ ...KLANT, status: 'Goedgekeurd', klantnr: 'KL-00007' });
    expect(screen.getByTestId('klant-modal-klantnr')).toHaveTextContent('KL-00007');
  });

  it('toont geen klantnummer in de kop wanneer de klant er geen heeft', () => {
    renderModal(KLANT);
    expect(screen.queryByTestId('klant-modal-klantnr')).not.toBeInTheDocument();
  });

  it('neemt het toegekende klantnummer over uit de respons bij goedkeuren', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, klantnr: 'KL-00008' }) });
    const { onUpdated } = renderModal(KLANT);
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));

    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Goedgekeurd', klantnr: 'KL-00008' })
      )
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_goedgekeurd',
      'Testbedrijf BV (KL-00008)'
    );
  });

  it('opens the afwijzen confirmation without patching immediately', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    expect(screen.getByTestId('klant-modal-afwijzen-bevestiging')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the afwijzen confirm button until a reason is entered', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).toBeDisabled();
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Onvolledige aanvraag' },
    });
    expect(screen.getByTestId('klant-modal-afwijzen-bevestigen')).not.toBeDisabled();
  });

  it('rejects the klant with the given reason and calls onUpdated with afwijsreden', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Onvolledige aanvraag' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ status: 'Afgewezen', afwijsreden: 'Onvolledige aanvraag' });
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        ...KLANT,
        status: 'Afgewezen',
        afwijsreden: 'Onvolledige aanvraag',
      })
    );
  });

  it('cancels the afwijzen confirmation without patching, and returns to the normal view', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Wordt niet verstuurd' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-annuleren'));
    expect(screen.queryByTestId('klant-modal-afwijzen-bevestiging')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the stored afwijsreden when the klant is Afgewezen', () => {
    renderModal({ ...KLANT, status: 'Afgewezen', afwijsreden: 'Onvolledige aanvraag' });
    expect(screen.getByTestId('klant-modal-afwijsreden')).toHaveTextContent('Onvolledige aanvraag');
  });

  it('does not show an afwijsreden block for a klant that is not Afgewezen', () => {
    renderModal(KLANT);
    expect(screen.queryByTestId('klant-modal-afwijsreden')).not.toBeInTheDocument();
  });

  it('shows an error and does not call onUpdated when the save request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Reden' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));

    expect(await screen.findByTestId('klant-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('logs klant_goedgekeurd with the logged-in medewerker on approval', async () => {
    renderModal(KLANT);
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'klant_goedgekeurd',
        'Testbedrijf BV'
      )
    );
  });

  it('logs klant_afgewezen with the reason included', async () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Onvolledige aanvraag' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'klant_afgewezen',
        'Testbedrijf BV: Onvolledige aanvraag'
      )
    );
  });

  it('does not log when the save request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('klant-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Reden' },
    });
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen-bevestigen'));
    await screen.findByTestId('klant-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows "Geen" for exclusief recht op kunstenaars when no kunstenaar lists this klant', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-exclusieve-kunstenaars-leeg')).toHaveTextContent('Geen');
  });

  it('shows the kunstenaars that list this klant in hun exclusieveKlantIds, read-only', () => {
    renderModal(ANDERE_KLANT);
    expect(screen.getByTestId('klant-modal-exclusieve-kunstenaars')).toHaveTextContent('Bram Steen');
    expect(screen.queryByTestId('klant-modal-exclusief-ka-2')).not.toBeInTheDocument();
  });

  it('links this klant account to a kunstenaar via the combobox and saves kunstenaarnr', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-KU-00001'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ kunstenaarnr: 'KU-00001' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, kunstenaarnr: 'KU-00001' }));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_kunstenaarkoppeling_gewijzigd',
      'Testbedrijf BV'
    );
  });

  it('blocks linking a kunstenaar that another klant already claims', () => {
    renderModal(KLANT);
    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-KU-00002'));
    expect(screen.getByTestId('klant-modal-error')).toHaveTextContent(
      'Deze kunstenaar is al gekoppeld aan een ander klantaccount.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows clearing an existing kunstenaar-koppeling', async () => {
    const { onUpdated } = renderModal({ ...KLANT, kunstenaarnr: 'KU-00001' });
    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-clear'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ kunstenaarnr: null });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, kunstenaarnr: null }));
  });

  it('links to the goedkeuren chapter of the gebruikershandleiding', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-help')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#klant-registratie-goedkeuren'
    );
    expect(screen.getByTestId('klant-modal-help')).toHaveAttribute('target', '_blank');
  });

  it('shows the resolved land name read-only, and a Combobox in edit mode', () => {
    renderModal({ ...KLANT, land: 'BE' });
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('België');
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    expect(screen.getByTestId('klant-modal-land')).toBeInTheDocument();
  });

  it('includes land and invoiceLand in the Opslaan diff when changed', async () => {
    // btwNummer is cleared here: the fixture's NL-format number would fail validation
    // once the land changes to BE, which is unrelated to what this test verifies.
    const { onUpdated } = renderModal({ ...KLANT, land: 'NL', btwNummer: '' });
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.focus(screen.getByTestId('klant-modal-land'));
    fireEvent.click(screen.getByTestId('klant-modal-land-option-BE'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({
      companyName: 'Testbedrijf BV',
      kvk: '12345678',
      btwNummer: '',
      contactPerson: 'Jan Jansen',
      contactPreference: 'email',
      email: 'jan@example.com',
      phone: '0612345678',
      address: 'Teststraat 1',
      postcode: '1234 AB',
      city: 'Teststad',
      land: 'BE',
      deliveryAddress: '',
      deliveryPostcode: '',
      deliveryCity: '',
      invoiceAddress: '',
      invoicePostcode: '',
      invoiceCity: '',
      invoiceLand: '',
    });
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, land: 'BE', btwNummer: '' })
    );
  });

  it('shows an invoiceLand Combobox inside the factuuradres block once it has a value', () => {
    renderModal({ ...KLANT, invoiceAddress: 'Factuurlaan 9', invoiceLand: 'DE' });
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Duitsland');
  });

  it('shows a btw warning and blocks Goedkeuren when the klant land has no matching tarief', () => {
    renderModal({ ...KLANT, land: 'DE', prijsgroepId: 'pg-1' }, PRIJSGROEPEN, KUNSTENAARS, [KLANT, ANDERE_KLANT], {
      tarieven: [{ land: 'NL', percentage: 21 }],
    });
    expect(screen.getByTestId('klant-modal-btw-waarschuwing')).toHaveTextContent('Duitsland');
    expect(screen.getByTestId('klant-modal-goedkeuren')).toBeDisabled();
  });

  it('does not show a btw warning and does not block Goedkeuren when the klant land has a matching tarief', () => {
    renderModal({ ...KLANT, land: 'NL', prijsgroepId: 'pg-1' });
    expect(screen.queryByTestId('klant-modal-btw-waarschuwing')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal-goedkeuren')).not.toBeDisabled();
  });

  it('resolves the btw warning against invoiceLand over land when both are set', () => {
    renderModal(
      { ...KLANT, land: 'NL', invoiceLand: 'DE', prijsgroepId: 'pg-1' },
      PRIJSGROEPEN,
      KUNSTENAARS,
      [KLANT, ANDERE_KLANT],
      { tarieven: [{ land: 'NL', percentage: 21 }] }
    );
    expect(screen.getByTestId('klant-modal-btw-waarschuwing')).toHaveTextContent('Duitsland');
  });

  it('still shows the btw warning for an already Goedgekeurd klant whose land tarief is missing', () => {
    renderModal({ ...KLANT, land: 'DE', status: 'Goedgekeurd', prijsgroepId: 'pg-1' }, PRIJSGROEPEN, KUNSTENAARS, [
      KLANT,
      ANDERE_KLANT,
    ], { tarieven: [{ land: 'NL', percentage: 21 }] });
    expect(screen.getByTestId('klant-modal-btw-waarschuwing')).toBeInTheDocument();
  });

  it('does not show a btw warning and does not block Goedkeuren while btwTarieven has not loaded yet', () => {
    renderModal({ ...KLANT, land: 'NL', prijsgroepId: 'pg-1' }, PRIJSGROEPEN, KUNSTENAARS, [KLANT, ANDERE_KLANT], null);
    expect(screen.queryByTestId('klant-modal-btw-waarschuwing')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal-goedkeuren')).not.toBeDisabled();
  });

  it('shows a btw warning and blocks Goedkeuren when btwTarieven failed to load (fail closed, not open)', () => {
    renderModal(
      { ...KLANT, land: 'NL', prijsgroepId: 'pg-1' },
      PRIJSGROEPEN,
      KUNSTENAARS,
      [KLANT, ANDERE_KLANT],
      null,
      true
    );
    expect(screen.getByTestId('klant-modal-btw-waarschuwing')).toBeInTheDocument();
    expect(screen.getByTestId('klant-modal-goedkeuren')).toBeDisabled();
  });

  it('shows a distinct "geen land" warning instead of an interpolated blank when the klant has no land set at all', () => {
    renderModal({ ...KLANT, land: '', invoiceLand: '', prijsgroepId: 'pg-1' });
    const waarschuwing = screen.getByTestId('klant-modal-btw-waarschuwing');
    expect(waarschuwing).toHaveTextContent('Geen land ingesteld voor deze klant');
    expect(waarschuwing).not.toHaveTextContent('Geen btw-tarief ingesteld voor .');
  });

  /**
   * Opslaan, Goedkeuren en Afwijzen roepen alledrie onUpdated aan, en KlantenSection
   * zet daarop `selectedKlant` op null -- de modal gaat dicht en het zojuist
   * uitgegeven wachtwoord is voorgoed weg. Dat gebeurde midden in het telefoontje
   * waarin de beheerder het aan het voorlezen was, want Opslaan is precies de knop
   * die je uit gewoonte indrukt.
   */
  describe('terwijl er een uitgegeven wachtwoord in beeld staat', () => {
    async function toonWachtwoord(klant: Klant = { ...KLANT, prijsgroepId: 'pg-1' }) {
      const result = renderModal(klant);
      fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
      fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));
      await screen.findByTestId('klant-wachtwoord-waarde');
      return result;
    }

    beforeEach(() => {
      fetchMock.mockImplementation(async (url: string) =>
        String(url).endsWith('/wachtwoord')
          ? { ok: true, json: async () => ({ wachtwoord: 'k7fp-r2mq-x4tz' }) }
          : { ok: true, json: async () => ({ ok: true }) }
      );
    });

    it('blokkeert Opslaan, Goedkeuren en Afwijzen', async () => {
      await toonWachtwoord();

      expect(screen.getByTestId('klant-modal-opslaan')).toBeDisabled();
      expect(screen.getByTestId('klant-modal-goedkeuren')).toBeDisabled();
      expect(screen.getByTestId('klant-modal-afwijzen')).toBeDisabled();
    });

    // Met een écht openstaande wijziging erbij: zonder de blokkade zou Opslaan hier
    // een PATCH sturen, onUpdated aanroepen en daarmee het venster sluiten.
    it('sluit de modal niet als er tóch op Opslaan geklikt wordt', async () => {
      const { onUpdated } = await toonWachtwoord({
        ...KLANT,
        status: 'Goedgekeurd',
        prijsgroepId: null,
      });
      fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-1' } });

      fireEvent.click(screen.getByTestId('klant-modal-opslaan'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(patchCall()).toBeUndefined();
      expect(onUpdated).not.toHaveBeenCalled();
      expect(screen.getByTestId('klant-wachtwoord-waarde')).toHaveTextContent('k7fp-r2mq-x4tz');
    });

    it('laat de knoppen gewoon werken zolang er geen wachtwoord staat', () => {
      const { onUpdated } = renderModal({ ...KLANT, prijsgroepId: 'pg-1' });

      expect(screen.getByTestId('klant-modal-opslaan')).not.toBeDisabled();
      expect(screen.getByTestId('klant-modal-goedkeuren')).not.toBeDisabled();
      expect(screen.getByTestId('klant-modal-afwijzen')).not.toBeDisabled();
      expect(onUpdated).not.toHaveBeenCalled();
    });
  });

  it('uses the medium modal width, not the narrow default or the 1400px wide variant', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('modal-header').parentElement).toHaveClass('max-w-4xl');
  });

  it('starts on the Gegevens tab and switches tab content when a tab is clicked', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-tab-gegevens')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('klant-modal-tab-adressen')).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(screen.getByTestId('klant-modal-tab-adressen'));
    expect(screen.getByTestId('klant-modal-tab-adressen')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('klant-modal-tab-gegevens')).toHaveAttribute('aria-selected', 'false');
  });

  it('resets to the Gegevens tab each time a different klant is opened', () => {
    const { rerender } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-tab-adressen'));
    expect(screen.getByTestId('klant-modal-tab-adressen')).toHaveAttribute('aria-selected', 'true');
    rerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <KlantModal
          klant={ANDERE_KLANT}
          prijsgroepen={PRIJSGROEPEN}
          kunstenaars={KUNSTENAARS}
          klanten={[KLANT, ANDERE_KLANT]}
          btwTarieven={BTWTARIEVEN}
          btwLoadError={false}
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('klant-modal-tab-gegevens')).toHaveAttribute('aria-selected', 'true');
  });

  it('groups fields into Bedrijfsgegevens and Koppelingen columns within the Gegevens tab', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    expect(screen.getByTestId('klant-modal-kolom-bedrijfsgegevens')).toContainElement(
      screen.getByTestId('klant-modal-companyName')
    );
    expect(screen.getByTestId('klant-modal-kolom-koppelingen')).toContainElement(
      screen.getByTestId('klant-modal-prijsgroep')
    );
  });

  it('hides the Adressen tab content until that tab is active, and vice versa for Gegevens', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-tab-content-gegevens').className).not.toContain('hidden');
    expect(screen.getByTestId('klant-modal-tab-content-adressen').className).toContain('hidden');
    fireEvent.click(screen.getByTestId('klant-modal-tab-adressen'));
    expect(screen.getByTestId('klant-modal-tab-content-adressen').className).not.toContain('hidden');
    expect(screen.getByTestId('klant-modal-tab-content-gegevens').className).toContain('hidden');
  });
});
