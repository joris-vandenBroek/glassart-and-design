import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KlantModal } from '@/components/beheer/KlantModal';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Prijsgroep } from '@/components/beheer/materiaalTypes';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
const logActiviteitMock = vi.fn();
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
  status: 'Beoordelen',
  prijsgroepId: null,
  kunstenaarId: null,
};

const ANDERE_KLANT: Klant = { ...KLANT, id: 'uid-2', companyName: 'Ander Bedrijf BV', kunstenaarId: 'ka-2' };

const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0, opslagpercentage: null },
  { id: 'pg-2', naam: 'Premium', kortingspercentage: 10, opslagpercentage: null },
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
    exclusieveKlantIds: [],
  },
  {
    id: 'ka-2',
    naam: 'Bram Steen',
    foto: null,
    omschrijvingNl: 'Werkt met steen.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: ['uid-2'],
  },
];

function renderModal(
  klant: Klant | null,
  prijsgroepen: Prijsgroep[] | null = PRIJSGROEPEN,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS,
  klanten: Klant[] | null = [KLANT, ANDERE_KLANT]
) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal
        klant={klant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        klanten={klanten}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated };
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
  fetchMock.mockResolvedValue({ ok: true });
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
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
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
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
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
    });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, contactPerson: 'Piet Pietersen' }));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
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
      expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, status: 'Goedgekeurd', prijsgroepId: 'pg-2' })
    );
  });

  it('rejects the klant and calls onUpdated with the updated klant', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ status: 'Afgewezen' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, status: 'Afgewezen' }));
  });

  it('shows an error and does not call onUpdated when the save request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));

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
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Testbedrijf BV'
      )
    );
  });

  it('logs klant_afgewezen with the logged-in medewerker on rejection', async () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'klant_afgewezen',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Testbedrijf BV'
      )
    );
  });

  it('does not log when the save request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
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

  it('links this klant account to a kunstenaar via the combobox and saves kunstenaarId', async () => {
    const { onUpdated } = renderModal(KLANT);
    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-ka-1'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ kunstenaarId: 'ka-1' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, kunstenaarId: 'ka-1' }));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'klant_kunstenaarkoppeling_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Testbedrijf BV'
    );
  });

  it('blocks linking a kunstenaar that another klant already claims', () => {
    renderModal(KLANT);
    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-ka-2'));
    expect(screen.getByTestId('klant-modal-error')).toHaveTextContent(
      'Deze kunstenaar is al gekoppeld aan een ander klantaccount.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows clearing an existing kunstenaar-koppeling', async () => {
    const { onUpdated } = renderModal({ ...KLANT, kunstenaarId: 'ka-1' });
    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-clear'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() => expect(patchCall()).toBeDefined());
    expect(patchBody()).toEqual({ kunstenaarId: null });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, kunstenaarId: null }));
  });

  it('shows a help popover with an explanation of the screen', () => {
    renderModal(KLANT);
    expect(screen.queryByTestId('klanten-help-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('klanten-help'));
    expect(screen.getByTestId('klanten-help-popover')).toHaveTextContent('prijsgroep');
  });
});
