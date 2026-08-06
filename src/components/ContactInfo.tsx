'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useApiRecord } from '@/lib/useApiRecord';
import type { Bedrijfsgegevens, Taal } from './beheer/bedrijfsgegevensTypes';

function vertaling(tekst: Record<Taal, string>, locale: string): string {
  const taal = (Object.prototype.hasOwnProperty.call(tekst, locale) ? locale : 'nl') as Taal;
  return tekst[taal] || tekst.nl;
}

export function ContactInfo() {
  const t = useTranslations('contactPage');
  const locale = useLocale();
  const { data: bedrijfsgegevens } = useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens');

  // See Contact.tsx: no placeholder address, phone numbers or bank details on a
  // public page — render nothing until the real bedrijfsgegevens are loaded.
  if (!bedrijfsgegevens) {
    return null;
  }

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    bedrijfsgegevens.bezoekadres
  )}`;
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(bedrijfsgegevens.bezoekadres)}&output=embed`;

  const whatsappContact = bedrijfsgegevens.contactpersonen.find((persoon) =>
    persoon.naam.startsWith('Paul van den Hout')
  );
  const whatsappNummer = whatsappContact
    ? whatsappContact.telefoon.replace(/[^\d]/g, '')
    : bedrijfsgegevens.whatsappNummer;

  return (
    <div className="flex flex-col gap-6 text-sm text-white/80">
      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('visitLabel')}</p>
        <p data-testid="contact-address" className="mt-2">
          {bedrijfsgegevens.bezoekadres}
        </p>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="contact-directions"
          className="mt-1 inline-block text-xs underline decoration-white/30"
        >
          {t('planRoute')}
        </a>
        <iframe
          data-testid="contact-map"
          src={mapEmbedUrl}
          title={t('visitLabel')}
          loading="lazy"
          className="mt-4 h-48 w-full rounded border border-white/10"
        />
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('contactsLabel')}</p>
        {bedrijfsgegevens.contactpersonen.map((persoon, index) => (
          <p key={persoon.id} className={index === 0 ? 'mt-2' : 'mt-3'} data-testid={`contact-person-${index}`}>
            <strong className="text-white">{persoon.naam}</strong> — {vertaling(persoon.rol, locale)}
            <br />
            <a
              href={`tel:${persoon.telefoon}`}
              data-testid={`contact-phone-${index}`}
              className="underline decoration-white/30"
            >
              {persoon.telefoon}
            </a>
          </p>
        ))}
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('emailLabel')}</p>
        <a
          href={`mailto:${bedrijfsgegevens.email}`}
          data-testid="contact-email"
          className="mt-2 inline-block underline decoration-white/30"
        >
          {bedrijfsgegevens.email}
        </a>
      </div>

      <div>
        <a
          href={`https://wa.me/${whatsappNummer}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="contact-whatsapp"
          className="inline-block rounded-sm bg-silver px-4 py-2 text-xs tracking-[0.15em] text-ink"
        >
          {t('whatsappLabel')}
        </a>
        {whatsappContact && (
          <span data-testid="contact-whatsapp-number" className="ml-2 text-xs text-white/70">
            {whatsappContact.telefoon}
          </span>
        )}
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('hoursLabel')}</p>
        <p className="mt-2">{vertaling(bedrijfsgegevens.openingstijden, locale)}</p>
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">{t('companyLabel')}</p>
        <p className="mt-2">
          {t('kvkLabel')}: {bedrijfsgegevens.kvkNummer}
          <br />
          {t('btwLabel')}: {bedrijfsgegevens.btwNummer}
          <br />
          {t('ibanLabel')}: {bedrijfsgegevens.iban}
        </p>
      </div>
    </div>
  );
}
