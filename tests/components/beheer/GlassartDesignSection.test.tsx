import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { GlassartDesignSection } from '@/components/beheer/GlassartDesignSection';
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';
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

const BEDRIJFSGEGEVENS: Bedrijfsgegevens = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartdesign.nl',
  whatsappNummer: '31600000000',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: 'Ma–vr: 09:00 – 17:00', en: '', fr: '', de: '' },
  contactpersonen: [
    {
      id: 'p1',
      naam: 'Paul van den Hout',
      telefoon: '+31651404089',
      rol: { nl: 'Voor projecten, hotels etc.', en: '', fr: '', de: '' },
    },
  ],
};

function renderSection(overrides: Partial<React.ComponentProps<typeof GlassartDesignSection>> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <GlassartDesignSection
        bedrijfsgegevens={BEDRIJFSGEGEVENS}
        loadError={null}
        onSave={onSave}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onSave };
}

describe('GlassartDesignSection', () => {
  it('shows the load error instead of the form when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('glassart-design-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('glassart-design-section')).not.toBeInTheDocument();
  });

  it('renders nothing while bedrijfsgegevens is null and there is no error', () => {
    renderSection({ bedrijfsgegevens: null });
    expect(screen.queryByTestId('glassart-design-section')).not.toBeInTheDocument();
  });

  it('pre-fills the form fields from bedrijfsgegevens', () => {
    renderSection();
    expect(screen.getByTestId('glassart-design-bezoekadres')).toHaveValue('Den Heuvel 21, 5688 EM Oirschot');
    expect(screen.getByTestId('glassart-design-email')).toHaveValue('info@glassartdesign.nl');
    expect(screen.getByTestId('glassart-design-whatsapp')).toHaveValue('31600000000');
    expect(screen.getByTestId('glassart-design-iban')).toHaveValue('NL00 BANK 0123 4567 89');
    expect(screen.getByTestId('glassart-design-kvk')).toHaveValue('12345678');
    expect(screen.getByTestId('glassart-design-btw')).toHaveValue('NL123456789B01');
    expect(screen.getByTestId('glassart-design-openingstijden-nl')).toHaveValue('Ma–vr: 09:00 – 17:00');
    expect(screen.getByTestId('glassart-design-openingstijden-en')).toHaveValue('');
    expect(screen.getByTestId('glassart-design-contactpersoon-p1-naam')).toHaveValue('Paul van den Hout');
    expect(screen.getByTestId('glassart-design-contactpersoon-p1-telefoon')).toHaveValue('+31651404089');
    expect(screen.getByTestId('glassart-design-contactpersoon-p1-rol-nl')).toHaveValue(
      'Voor projecten, hotels etc.'
    );
    expect(screen.getByTestId('glassart-design-contactpersoon-p1-rol-en')).toHaveValue('');
  });

  it('keeps the openingstijden and rol fields for each language independent', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('glassart-design-openingstijden-en'), {
      target: { value: 'Mon-Fri: 9-17' },
    });
    expect(screen.getByTestId('glassart-design-openingstijden-nl')).toHaveValue('Ma–vr: 09:00 – 17:00');
    expect(screen.getByTestId('glassart-design-openingstijden-en')).toHaveValue('Mon-Fri: 9-17');
  });

  it('adds a new empty contactpersoon row', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('glassart-design-contactpersoon-toevoegen'));
    const rows = screen.getAllByPlaceholderText('Naam');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveValue('');
  });

  it('removes a contactpersoon row', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('glassart-design-contactpersoon-p1-verwijderen'));
    expect(screen.queryByTestId('glassart-design-contactpersoon-p1-naam')).not.toBeInTheDocument();
  });

  it('saves the form and logs bedrijfsgegevens_gewijzigd', async () => {
    const { onSave } = renderSection();
    fireEvent.change(screen.getByTestId('glassart-design-email'), {
      target: { value: 'nieuw@glassartdesign.nl' },
    });
    fireEvent.click(screen.getByTestId('glassart-design-opslaan'));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ email: 'nieuw@glassartdesign.nl' }))
    );
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('bedrijfsgegevens_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('shows an action error and does not log when onSave fails', async () => {
    renderSection({ onSave: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('glassart-design-opslaan'));
    expect(await screen.findByTestId('glassart-design-error-message')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});
