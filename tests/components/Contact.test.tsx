import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { Contact } from '@/components/Contact';
import messages from '../../messages/nl.json';

const getDocMock = vi.fn();
const setDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

const BEDRIJFSGEGEVENS = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartanddesign.com',
  whatsappNummer: '31600000000',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: 'Ma–vr: 09:00 – 17:00', en: 'Mon-Fri: 9-17', fr: '', de: '' },
  contactpersonen: [
    {
      id: 'seed-hem',
      naam: 'Hem Brekoo',
      telefoon: '+31653736756',
      rol: { nl: 'Voor zakelijke klanten (B2B)', en: '', fr: '', de: '' },
    },
    {
      id: 'seed-paul',
      naam: 'Paul van den Hout',
      telefoon: '+31651404089',
      rol: { nl: 'Voor projecten, hotels etc.', en: '', fr: '', de: '' },
    },
  ],
};

function mockDoc(data: typeof BEDRIJFSGEGEVENS | null) {
  getDocMock.mockResolvedValue({
    exists: () => data !== null,
    data: () => data,
  });
}

beforeEach(() => {
  getDocMock.mockReset();
  setDocMock.mockReset();
});

describe('Contact', () => {
  it('renders contact details from the beheer-managed bedrijfsgegevens and exposes the #contact anchor', async () => {
    mockDoc(BEDRIJFSGEGEVENS);
    renderWithIntl(<Contact />, 'nl', messages);
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByTestId('glass-panel')).toHaveAttribute('id', 'contact');

    expect(
      await screen.findByRole('link', { name: 'info@glassartanddesign.com' })
    ).toHaveAttribute('href', 'mailto:info@glassartanddesign.com');

    expect(screen.getByText('Hem Brekoo')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '+31653736756' })
    ).toHaveAttribute('href', 'tel:+31653736756');
    expect(screen.getByText('Paul van den Hout')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '+31651404089' })
    ).toHaveAttribute('href', 'tel:+31651404089');
  });

  it('renders the seed data immediately as a fallback while the real document is still loading', () => {
    getDocMock.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<Contact />, 'nl', messages);
    expect(
      screen.getByRole('link', { name: 'info@glassartanddesign.com' })
    ).toBeInTheDocument();
  });
});
