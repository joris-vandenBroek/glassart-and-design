import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InstellingenSection } from '@/components/beheer/InstellingenSection';
import type { Bestelinstellingen } from '@/components/beheer/bestelinstellingenTypes';
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

function renderSection(overrides: Partial<React.ComponentProps<typeof InstellingenSection>> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <InstellingenSection
        bestelinstellingen={BESTELINSTELLINGEN}
        loadError={null}
        onSave={onSave}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onSave };
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
});
