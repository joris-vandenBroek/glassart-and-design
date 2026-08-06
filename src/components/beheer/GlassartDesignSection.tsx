'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Bedrijfsgegevens, Contactpersoon, Taal } from './bedrijfsgegevensTypes';

interface GlassartDesignSectionProps {
  bedrijfsgegevens: Bedrijfsgegevens | null;
  loadError: string | null;
  onSave: (data: Bedrijfsgegevens) => Promise<boolean>;
}

const ROL_TALEN: { taal: Taal; labelKey: string }[] = [
  { taal: 'nl', labelKey: 'glassartDesignLabelRolNl' },
  { taal: 'fr', labelKey: 'glassartDesignLabelRolFr' },
  { taal: 'de', labelKey: 'glassartDesignLabelRolDe' },
  { taal: 'en', labelKey: 'glassartDesignLabelRolEn' },
];

const OPENINGSTIJDEN_TALEN: { taal: Taal; labelKey: string }[] = [
  { taal: 'nl', labelKey: 'glassartDesignLabelOpeningstijdenNl' },
  { taal: 'fr', labelKey: 'glassartDesignLabelOpeningstijdenFr' },
  { taal: 'de', labelKey: 'glassartDesignLabelOpeningstijdenDe' },
  { taal: 'en', labelKey: 'glassartDesignLabelOpeningstijdenEn' },
];

const INPUT_CLASS = 'rounded-sm bg-black/40 px-3 py-2 text-sm text-white';
const LABEL_CLASS = 'flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60';

function maakLegeContactpersoon(): Contactpersoon {
  return {
    id: crypto.randomUUID(),
    naam: '',
    telefoon: '',
    rol: { nl: '', en: '', fr: '', de: '' },
  };
}

export function GlassartDesignSection({ bedrijfsgegevens, loadError, onSave }: GlassartDesignSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [form, setForm] = useState<Bedrijfsgegevens | null>(bedrijfsgegevens);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setForm(bedrijfsgegevens);
  }, [bedrijfsgegevens]);

  if (loadError) {
    return (
      <p data-testid="glassart-design-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (form === null) {
    return null;
  }

  function updateField<K extends keyof Bedrijfsgegevens>(key: K, value: Bedrijfsgegevens[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateOpeningstijden(taal: Taal, waarde: string) {
    if (!form) return;
    updateField('openingstijden', { ...form.openingstijden, [taal]: waarde });
  }

  function addContactpersoon() {
    if (!form) return;
    updateField('contactpersonen', [...form.contactpersonen, maakLegeContactpersoon()]);
  }

  function removeContactpersoon(id: string) {
    if (!form) return;
    updateField(
      'contactpersonen',
      form.contactpersonen.filter((persoon) => persoon.id !== id)
    );
  }

  function updateContactpersoon(id: string, veld: 'naam' | 'telefoon', waarde: string) {
    if (!form) return;
    updateField(
      'contactpersonen',
      form.contactpersonen.map((persoon) => (persoon.id === id ? { ...persoon, [veld]: waarde } : persoon))
    );
  }

  function updateContactpersoonRol(id: string, taal: Taal, waarde: string) {
    if (!form) return;
    updateField(
      'contactpersonen',
      form.contactpersonen.map((persoon) =>
        persoon.id === id ? { ...persoon, rol: { ...persoon.rol, [taal]: waarde } } : persoon
      )
    );
  }

  async function handleSave() {
    if (!form) return;
    setActionError(null);
    const success = await onSave(form);
    if (success) {
      void logActiviteit('bedrijfsgegevens_gewijzigd', actorFromMedewerker(user));
    } else {
      setActionError(t('glassartDesignActionError'));
    }
  }

  return (
    <div data-testid="glassart-design-section" className="flex flex-col gap-6 text-sm text-white/80">
      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelBezoekadres')}
        <input
          type="text"
          value={form.bezoekadres}
          onChange={(event) => updateField('bezoekadres', event.target.value)}
          data-testid="glassart-design-bezoekadres"
          className={INPUT_CLASS}
        />
      </label>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/60">
          {t('glassartDesignLabelContactpersonen')}
        </p>
        <div className="flex flex-col gap-3">
          {form.contactpersonen.map((persoon) => (
            <div
              key={persoon.id}
              data-testid={`glassart-design-contactpersoon-${persoon.id}`}
              className="flex flex-col gap-2 rounded-sm border border-white/10 p-3"
            >
              <input
                type="text"
                value={persoon.naam}
                onChange={(event) => updateContactpersoon(persoon.id, 'naam', event.target.value)}
                placeholder={t('glassartDesignLabelNaam')}
                data-testid={`glassart-design-contactpersoon-${persoon.id}-naam`}
                className={INPUT_CLASS}
              />
              <input
                type="text"
                value={persoon.telefoon}
                onChange={(event) => updateContactpersoon(persoon.id, 'telefoon', event.target.value)}
                placeholder={t('glassartDesignLabelTelefoon')}
                data-testid={`glassart-design-contactpersoon-${persoon.id}-telefoon`}
                className={INPUT_CLASS}
              />
              {ROL_TALEN.map(({ taal, labelKey }) => (
                <label key={taal} className={LABEL_CLASS}>
                  {t(labelKey)}
                  <input
                    type="text"
                    value={persoon.rol[taal]}
                    onChange={(event) => updateContactpersoonRol(persoon.id, taal, event.target.value)}
                    data-testid={`glassart-design-contactpersoon-${persoon.id}-rol-${taal}`}
                    className={INPUT_CLASS}
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() => removeContactpersoon(persoon.id)}
                data-testid={`glassart-design-contactpersoon-${persoon.id}-verwijderen`}
                className="self-end rounded-full bg-black/50 px-3 py-1 text-xs text-white/70 hover:text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addContactpersoon}
          data-testid="glassart-design-contactpersoon-toevoegen"
          className="mt-3 btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
        >
          {t('glassartDesignContactpersoonToevoegen')}
        </button>
      </div>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelEmail')}
        <input
          type="text"
          value={form.email}
          onChange={(event) => updateField('email', event.target.value)}
          data-testid="glassart-design-email"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelWhatsapp')}
        <input
          type="text"
          value={form.whatsappNummer}
          onChange={(event) => updateField('whatsappNummer', event.target.value)}
          data-testid="glassart-design-whatsapp"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelTenaamstelling')}
        <input
          type="text"
          value={form.tenaamstelling}
          onChange={(event) => updateField('tenaamstelling', event.target.value)}
          data-testid="glassart-design-tenaamstelling"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelIban')}
        <input
          type="text"
          value={form.iban}
          onChange={(event) => updateField('iban', event.target.value)}
          data-testid="glassart-design-iban"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelBic')}
        <input
          type="text"
          value={form.bic}
          onChange={(event) => updateField('bic', event.target.value)}
          data-testid="glassart-design-bic"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelKvk')}
        <input
          type="text"
          value={form.kvkNummer}
          onChange={(event) => updateField('kvkNummer', event.target.value)}
          data-testid="glassart-design-kvk"
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        {t('glassartDesignLabelBtw')}
        <input
          type="text"
          value={form.btwNummer}
          onChange={(event) => updateField('btwNummer', event.target.value)}
          data-testid="glassart-design-btw"
          className={INPUT_CLASS}
        />
      </label>

      {OPENINGSTIJDEN_TALEN.map(({ taal, labelKey }) => (
        <label key={taal} className={LABEL_CLASS}>
          {t(labelKey)}
          <input
            type="text"
            value={form.openingstijden[taal]}
            onChange={(event) => updateOpeningstijden(taal, event.target.value)}
            data-testid={`glassart-design-openingstijden-${taal}`}
            className={INPUT_CLASS}
          />
        </label>
      ))}

      {actionError && (
        <p data-testid="glassart-design-error-message" className="text-xs text-red-400">
          {actionError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        data-testid="glassart-design-opslaan"
        className="self-start btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
      >
        {t('glassartDesignOpslaan')}
      </button>
    </div>
  );
}
