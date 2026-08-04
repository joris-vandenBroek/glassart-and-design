import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InstellingenSection } from '@/components/beheer/InstellingenSection';
import type { Bestelinstellingen } from '@/components/beheer/bestelinstellingenTypes';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
import messages from '../../../messages/nl.json';

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

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const BESTELINSTELLINGEN: Bestelinstellingen = { minimaleAfname: 3 };
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };

function renderSection(overrides: Partial<React.ComponentProps<typeof InstellingenSection>> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  const onSaveBtw = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <InstellingenSection
        bestelinstellingen={BESTELINSTELLINGEN}
        loadError={null}
        onSave={onSave}
        btwTarieven={BTWTARIEVEN}
        btwLoadError={null}
        onSaveBtw={onSaveBtw}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onSave, onSaveBtw };
}

describe('InstellingenSection', () => {
  it('shows the load error instead of the form when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('instellingen-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('instellingen-section')).not.toBeInTheDocument();
  });

  it('renders nothing while bestelinstellingen is null and there is no error', () => {
    renderSection({ bestelinstellingen: null });
    expect(screen.queryByTestId('instellingen-section')).not.toBeInTheDocument();
  });

  it('pre-fills the minimale afname field', () => {
    renderSection();
    expect(screen.getByTestId('instellingen-minimale-afname')).toHaveValue(3);
  });

  it('saves the new value and logs bestelinstellingen_gewijzigd', async () => {
    const { onSave } = renderSection();
    fireEvent.change(screen.getByTestId('instellingen-minimale-afname'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ minimaleAfname: 8 }));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('bestelinstellingen_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('clamps a value below 1 up to 1 on save', async () => {
    const { onSave } = renderSection();
    fireEvent.change(screen.getByTestId('instellingen-minimale-afname'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ minimaleAfname: 1 }));
  });

  it('shows an action error and does not log when onSave fails', async () => {
    renderSection({ onSave: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    expect(await screen.findByTestId('instellingen-error-message')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('pre-fills the btw-tarieven rows and the standaardtarief', () => {
    renderSection();
    expect(screen.getByTestId('instellingen-btw-standaard')).toHaveValue(21);
    expect(screen.getByTestId('instellingen-btw-percentage-0')).toHaveValue(21);
    expect(screen.getByTestId('instellingen-btw-land-0')).toHaveValue('Nederland');
  });

  it('adds a new land+percentage row via "Land toevoegen"', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('instellingen-btw-toevoegen'));
    expect(screen.getByTestId('instellingen-btw-land-1')).toBeInTheDocument();
    fireEvent.focus(screen.getByTestId('instellingen-btw-land-1'));
    fireEvent.click(screen.getByTestId('instellingen-btw-land-1-option-BE'));
    fireEvent.change(screen.getByTestId('instellingen-btw-percentage-1'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    expect(screen.getByTestId('instellingen-btw-land-1')).toHaveValue('België');
  });

  it('removes a row via its verwijder-knop', () => {
    renderSection({
      btwTarieven: {
        tarieven: [
          { land: 'NL', percentage: 21 },
          { land: 'BE', percentage: 6 },
        ],
        standaardPercentage: 21,
      },
    });
    expect(screen.getByTestId('instellingen-btw-land-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('instellingen-btw-verwijderen-1'));
    expect(screen.queryByTestId('instellingen-btw-land-1')).not.toBeInTheDocument();
  });

  it('saves btw-tarieven changes via onSaveBtw and logs btwtarieven_gewijzigd', async () => {
    const { onSaveBtw } = renderSection();
    fireEvent.change(screen.getByTestId('instellingen-btw-percentage-0'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('instellingen-opslaan'));
    await waitFor(() =>
      expect(onSaveBtw).toHaveBeenCalledWith({
        tarieven: [{ land: 'NL', percentage: 20 }],
        standaardPercentage: 21,
      })
    );
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('btwtarieven_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });
});
