import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';

export const BEDRIJFSGEGEVENS_SEED: Bedrijfsgegevens = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartanddesign.com',
  whatsappNummer: '31600000000',
  tenaamstelling: 'Glassart & Design',
  bic: 'BANKNL2A',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: {
    nl: 'Ma–vr: 09:00 – 17:00',
    en: 'Mon–Fri: 09:00 – 17:00',
    fr: 'Lun–ven : 09h00 – 17h00',
    de: 'Mo–Fr: 09:00 – 17:00 Uhr',
  },
  contactpersonen: [
    {
      id: 'seed-paul',
      naam: 'Paul van den Hout',
      telefoon: '+31651404089',
      rol: {
        nl: 'Voor projecten, hotels etc.',
        en: 'For projects, hotels etc.',
        fr: 'Pour les projets, hôtels, etc.',
        de: 'Für Projekte, Hotels usw.',
      },
    },
    {
      id: 'seed-hem',
      naam: 'Hem Brekoo',
      telefoon: '+31653736756',
      rol: {
        nl: 'Voor zakelijke klanten (B2B)',
        en: 'For business clients (B2B)',
        fr: 'Pour les clients professionnels (B2B)',
        de: 'Für Geschäftskunden (B2B)',
      },
    },
  ],
};
