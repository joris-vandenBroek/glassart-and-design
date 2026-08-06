import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { ContactInfo } from '@/components/ContactInfo';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const BEDRIJFSGEGEVENS = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartdesign.nl',
  whatsappNummer: '31600000000',
  tenaamstelling: 'Glassart & Design',
  bic: 'BANKNL2A',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: 'Ma–vr: 09:00 – 17:00', en: 'Mon-Fri: 9-17', fr: '', de: '' },
  contactpersonen: [
    {
      id: 'seed-paul',
      naam: 'Paul van den Hout',
      telefoon: '+31651404089',
      rol: { nl: 'Voor projecten, hotels etc.', en: '', fr: '', de: '' },
    },
    {
      id: 'seed-hem',
      naam: 'Hem Brekoo',
      telefoon: '+31653736756',
      rol: { nl: 'Voor zakelijke klanten (B2B)', en: '', fr: '', de: '' },
    },
  ],
};

function mockRecord(data: typeof BEDRIJFSGEGEVENS | null) {
  fetchMock.mockResolvedValue({ ok: data !== null, json: async () => data });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('ContactInfo', () => {
  it('renders the visiting address and a directions link from the API', async () => {
    mockRecord(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(await screen.findByTestId('contact-address')).toHaveTextContent(
      'Den Heuvel 21, 5688 EM Oirschot'
    );
    expect(screen.getByTestId('contact-directions')).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps')
    );
  });

  it('embeds a Google Maps iframe for the address', async () => {
    mockRecord(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    const iframe = await screen.findByTestId('contact-map');
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe).toHaveAttribute('src', expect.stringContaining('output=embed'));
  });

  it('renders all contact persons with correct tel links and the NL role text', async () => {
    mockRecord(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(await screen.findByTestId('contact-person-0')).toHaveTextContent('Paul van den Hout');
    expect(screen.getByTestId('contact-person-0')).toHaveTextContent('Voor projecten, hotels etc.');
    expect(screen.getByTestId('contact-phone-0')).toHaveAttribute('href', 'tel:+31651404089');
    expect(screen.getByTestId('contact-person-1')).toHaveTextContent('Hem Brekoo');
    expect(screen.getByTestId('contact-phone-1')).toHaveAttribute('href', 'tel:+31653736756');
  });

  it('falls back to the NL role text when the active locale has no translation', async () => {
    mockRecord(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'en', messages);
    expect(await screen.findByTestId('contact-person-0')).toHaveTextContent(
      'Voor projecten, hotels etc.'
    );
  });

  it('renders a mailto link with the API email address', async () => {
    mockRecord(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(await screen.findByTestId('contact-email')).toHaveAttribute(
      'href',
      'mailto:info@glassartdesign.nl'
    );
  });

  it('renders a WhatsApp link and visible number for contact person Paul van den Hout', async () => {
    mockRecord(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(await screen.findByTestId('contact-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/31651404089'
    );
    expect(screen.getByTestId('contact-whatsapp-number')).toHaveTextContent('+31651404089');
  });

  it('falls back to the generic WhatsApp number when Paul van den Hout is not a contact person', async () => {
    mockRecord({
      ...BEDRIJFSGEGEVENS,
      contactpersonen: [BEDRIJFSGEGEVENS.contactpersonen[1]],
    });
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(await screen.findByTestId('contact-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/31600000000'
    );
    expect(screen.queryByTestId('contact-whatsapp-number')).not.toBeInTheDocument();
  });

  it('renders opening hours for the active locale and the company registration block', async () => {
    mockRecord(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'en', messages);
    expect(await screen.findByText('Mon-Fri: 9-17')).toBeInTheDocument();
    expect(screen.getByText(/KvK-nummer/)).toBeInTheDocument();
    expect(screen.getByText(/BTW-nummer/)).toBeInTheDocument();
    expect(screen.getByText(/IBAN/)).toBeInTheDocument();
  });

  it('renders the seed data immediately as a fallback while the real record is still loading', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(screen.getByTestId('contact-address')).toHaveTextContent(
      BEDRIJFSGEGEVENS.bezoekadres
    );
  });

  it('never writes to the record from the public contact page', async () => {
    mockRecord(BEDRIJFSGEGEVENS);
    renderWithIntl(<ContactInfo />, 'nl', messages);
    await screen.findByTestId('contact-address');
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'PATCH' }));
  });
});
