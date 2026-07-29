'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Klant } from './KlantenSection';
import type { Prijsgroep } from './materiaalTypes';
import type { Kunstenaar } from './kunstenaarTypes';

const STATUS_BADGE_CLASS: Record<Klant['status'], string> = {
  Beoordelen: 'bg-amber-400/10 text-amber-300',
  Goedgekeurd: 'bg-green-500/10 text-green-400',
  Afgewezen: 'bg-red-400/10 text-red-400',
};

interface EditableFields {
  companyName: string;
  kvk: string;
  contactPerson: string;
  contactPreference: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  deliveryAddress: string;
  deliveryPostcode: string;
  deliveryCity: string;
  invoiceAddress: string;
  invoicePostcode: string;
  invoiceCity: string;
}

function fieldsFromKlant(klant: Klant): EditableFields {
  return {
    companyName: klant.companyName,
    kvk: klant.kvk,
    contactPerson: klant.contactPerson,
    contactPreference: klant.contactPreference,
    email: klant.email,
    phone: klant.phone,
    address: klant.address,
    postcode: klant.postcode,
    city: klant.city,
    deliveryAddress: klant.deliveryAddress,
    deliveryPostcode: klant.deliveryPostcode,
    deliveryCity: klant.deliveryCity,
    invoiceAddress: klant.invoiceAddress,
    invoicePostcode: klant.invoicePostcode,
    invoiceCity: klant.invoiceCity,
  };
}

interface KlantModalProps {
  klant: Klant | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  onClose: () => void;
  onUpdated: (klant: Klant) => void;
  onKunstenaarUpdated: (id: string, data: Partial<Omit<Kunstenaar, 'id'>>) => Promise<boolean>;
}

export function KlantModal({
  klant,
  prijsgroepen,
  kunstenaars,
  onClose,
  onUpdated,
  onKunstenaarUpdated,
}: KlantModalProps) {
  const t = useTranslations('beheer');
  const [prijsgroepId, setPrijsgroepId] = useState('');
  const [exclusieveKunstenaarIds, setExclusieveKunstenaarIds] = useState<string[]>([]);
  const [minimaleAfname, setMinimaleAfname] = useState('');
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  useEffect(() => {
    if (klant) {
      setPrijsgroepId(klant.prijsgroepId ?? '');
      setExclusieveKunstenaarIds(klant.exclusieveKunstenaarIds);
      setMinimaleAfname(klant.minimaleAfname != null ? String(klant.minimaleAfname) : '');
      setFields(fieldsFromKlant(klant));
      setIsEditing(false);
      setError(null);
    }
  }, [klant]);

  function setField<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleBewerken() {
    setIsEditing(true);
  }

  function handleAnnuleren() {
    if (klant) {
      setFields(fieldsFromKlant(klant));
    }
    setIsEditing(false);
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function toggleExclusiviteit(kunstenaarId: string) {
    const kunstenaar = (kunstenaars ?? []).find((item) => item.id === kunstenaarId);
    const isChecked = exclusieveKunstenaarIds.includes(kunstenaarId);
    if (!isChecked && kunstenaar?.exclusiefVoorKlantId && kunstenaar.exclusiefVoorKlantId !== klant?.id) {
      setError(t('klantenExclusiviteitBlocked'));
      return;
    }
    setError(null);
    setExclusieveKunstenaarIds((current) => toggle(current, kunstenaarId));
  }

  async function handleOpslaan() {
    if (!klant || !fields) return;
    setError(null);

    const origineleFields = fieldsFromKlant(klant);
    const veldenGewijzigd =
      isEditing && (Object.keys(origineleFields) as (keyof EditableFields)[]).some((key) => fields[key] !== origineleFields[key]);
    const prijsgroepGewijzigd =
      klant.status === 'Goedgekeurd' && prijsgroepId !== '' && prijsgroepId !== (klant.prijsgroepId ?? '');
    const exclusiviteitGewijzigd =
      exclusieveKunstenaarIds.length !== klant.exclusieveKunstenaarIds.length ||
      exclusieveKunstenaarIds.some((id) => !klant.exclusieveKunstenaarIds.includes(id));
    const trimmedMinimaleAfname = minimaleAfname.trim();
    const parsedMinimaleAfname =
      trimmedMinimaleAfname === '' ? null : Math.max(1, Math.round(Number(trimmedMinimaleAfname)) || 1);
    const minimaleAfnameGewijzigd = parsedMinimaleAfname !== (klant.minimaleAfname ?? null);

    if (!veldenGewijzigd && !prijsgroepGewijzigd && !exclusiviteitGewijzigd && !minimaleAfnameGewijzigd) {
      setIsEditing(false);
      return;
    }

    try {
      // Eerst de back-pointers op de kunstenaars, dán pas het klantdocument. Alleen
      // `Kunstenaar.exclusiefVoorKlantId` wordt door de server-side check en de winkel-UI
      // gelezen; `Klant.exclusieveKunstenaarIds` is puur administratief. Faalt een
      // back-pointer halverwege, dan stoppen we met het klantdocument ONGEWIJZIGD in
      // plaats van met een klant die een niet-gehandhaafde exclusiviteit claimt.
      if (exclusiviteitGewijzigd) {
        const added = exclusieveKunstenaarIds.filter((id) => !klant.exclusieveKunstenaarIds.includes(id));
        const removed = klant.exclusieveKunstenaarIds.filter((id) => !exclusieveKunstenaarIds.includes(id));
        for (const id of added) {
          if (!(await onKunstenaarUpdated(id, { exclusiefVoorKlantId: klant.id }))) {
            setError(t('klantenActionError'));
            return;
          }
        }
        for (const id of removed) {
          if (!(await onKunstenaarUpdated(id, { exclusiefVoorKlantId: null }))) {
            setError(t('klantenActionError'));
            return;
          }
        }
      }

      const updates: Partial<Klant> = {};
      if (veldenGewijzigd) Object.assign(updates, fields);
      if (prijsgroepGewijzigd) updates.prijsgroepId = prijsgroepId;
      if (exclusiviteitGewijzigd) updates.exclusieveKunstenaarIds = exclusieveKunstenaarIds;
      if (minimaleAfnameGewijzigd) updates.minimaleAfname = parsedMinimaleAfname;

      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('update failed');

      if (veldenGewijzigd) void logActiviteit('klant_gewijzigd', actorFromMedewerker(user), klant.companyName);
      if (prijsgroepGewijzigd) void logActiviteit('klant_prijsgroep_gewijzigd', actorFromMedewerker(user), klant.companyName);
      if (exclusiviteitGewijzigd) void logActiviteit('klant_exclusiviteit_gewijzigd', actorFromMedewerker(user), klant.companyName);
      if (minimaleAfnameGewijzigd) void logActiviteit('klant_minimale_afname_gewijzigd', actorFromMedewerker(user), klant.companyName);

      onUpdated({ ...klant, ...updates });
      if (minimaleAfnameGewijzigd) {
        setMinimaleAfname(parsedMinimaleAfname != null ? String(parsedMinimaleAfname) : '');
      }
      setIsEditing(false);
    } catch {
      setError(t('klantenActionError'));
    }
  }

  async function handleGoedkeuren() {
    if (!klant) return;
    try {
      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Goedgekeurd', prijsgroepId }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('klant_goedgekeurd', actorFromMedewerker(user), klant.companyName);
      onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroepId });
    } catch {
      setError(t('klantenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!klant) return;
    try {
      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('klant_afgewezen', actorFromMedewerker(user), klant.companyName);
      onUpdated({ ...klant, status: 'Afgewezen' });
    } catch {
      setError(t('klantenActionError'));
    }
  }

  return (
    <Modal
      isOpen={klant !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={t('klantenModalTitel')}
      footerActions={
        klant && fields ? (
          <>
            {isEditing && (
              <button
                type="button"
                onClick={handleAnnuleren}
                data-testid="klant-modal-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            )}
            <button
              type="button"
              onClick={handleOpslaan}
              data-testid="klant-modal-opslaan"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('klantenOpslaan')}
            </button>
            {!isEditing && klant.status !== 'Goedgekeurd' && (
              <button
                type="button"
                onClick={handleGoedkeuren}
                disabled={!prijsgroepId}
                data-testid="klant-modal-goedkeuren"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('klantenGoedkeuren')}
              </button>
            )}
            {!isEditing && (
              <button
                type="button"
                onClick={handleAfwijzen}
                data-testid="klant-modal-afwijzen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('klantenAfwijzen')}
              </button>
            )}
          </>
        ) : null
      }
    >
      {klant && fields && (
        <div data-testid="klant-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <div className="flex items-center justify-between">
            <span
              data-testid="klant-modal-status"
              className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${STATUS_BADGE_CLASS[klant.status]}`}
            >
              {klant.status}
            </span>
            {!isEditing && (
              <button
                type="button"
                onClick={handleBewerken}
                data-testid="klant-modal-bewerken"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('bewerken')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Veld
              label={t('klantenColCompanyName')}
              value={fields.companyName}
              editing={isEditing}
              testId="klant-modal-companyName"
              onChange={(value) => setField('companyName', value)}
            />
            <Veld
              label={t('klantenColKvk')}
              value={fields.kvk}
              editing={isEditing}
              testId="klant-modal-kvk"
              onChange={(value) => setField('kvk', value)}
            />
            <Veld
              label={t('klantenColContactPerson')}
              value={fields.contactPerson}
              editing={isEditing}
              testId="klant-modal-contactPerson"
              onChange={(value) => setField('contactPerson', value)}
            />
            {isEditing ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-white/60">
                  {t('klantenContactPreference')}
                </span>
                <select
                  value={fields.contactPreference}
                  onChange={(event) => setField('contactPreference', event.target.value)}
                  data-testid="klant-modal-contactPreference"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                >
                  <option value="email">{t('klantenContactPreferenceEmail')}</option>
                  <option value="phone">{t('klantenContactPreferencePhone')}</option>
                  <option value="whatsapp">{t('klantenContactPreferenceWhatsapp')}</option>
                </select>
              </label>
            ) : (
              <Veld label={t('klantenContactPreference')} value={fields.contactPreference} editing={false} />
            )}
            <Veld
              label={t('klantenColEmail')}
              value={fields.email}
              editing={isEditing}
              testId="klant-modal-email"
              onChange={(value) => setField('email', value)}
            />
            <Veld
              label={t('klantenColPhone')}
              value={fields.phone}
              editing={isEditing}
              testId="klant-modal-phone"
              onChange={(value) => setField('phone', value)}
            />
            <Veld
              label={t('klantenLabelAdres')}
              value={fields.address}
              editing={isEditing}
              testId="klant-modal-address"
              onChange={(value) => setField('address', value)}
            />
            <Veld
              label={t('klantenLabelPostcode')}
              value={fields.postcode}
              editing={isEditing}
              testId="klant-modal-postcode"
              onChange={(value) => setField('postcode', value)}
            />
            <Veld
              label={t('klantenLabelPlaats')}
              value={fields.city}
              editing={isEditing}
              testId="klant-modal-city"
              onChange={(value) => setField('city', value)}
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <span className="text-xs uppercase tracking-wide text-white/60">{t('klantenLabelAfleveradres')}</span>
            {!isEditing && fields.deliveryAddress === '' ? (
              <p data-testid="klant-modal-afleveradres-leeg" className="text-white/50">
                {t('klantenLabelGebruiktStandaardadres')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Veld
                  label={t('klantenLabelAdres')}
                  value={fields.deliveryAddress}
                  editing={isEditing}
                  testId="klant-modal-deliveryAddress"
                  onChange={(value) => setField('deliveryAddress', value)}
                />
                <Veld
                  label={t('klantenLabelPostcode')}
                  value={fields.deliveryPostcode}
                  editing={isEditing}
                  testId="klant-modal-deliveryPostcode"
                  onChange={(value) => setField('deliveryPostcode', value)}
                />
                <Veld
                  label={t('klantenLabelPlaats')}
                  value={fields.deliveryCity}
                  editing={isEditing}
                  testId="klant-modal-deliveryCity"
                  onChange={(value) => setField('deliveryCity', value)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <span className="text-xs uppercase tracking-wide text-white/60">{t('klantenLabelFactuuradres')}</span>
            {!isEditing && fields.invoiceAddress === '' ? (
              <p data-testid="klant-modal-factuuradres-leeg" className="text-white/50">
                {t('klantenLabelGebruiktStandaardadres')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Veld
                  label={t('klantenLabelAdres')}
                  value={fields.invoiceAddress}
                  editing={isEditing}
                  testId="klant-modal-invoiceAddress"
                  onChange={(value) => setField('invoiceAddress', value)}
                />
                <Veld
                  label={t('klantenLabelPostcode')}
                  value={fields.invoicePostcode}
                  editing={isEditing}
                  testId="klant-modal-invoicePostcode"
                  onChange={(value) => setField('invoicePostcode', value)}
                />
                <Veld
                  label={t('klantenLabelPlaats')}
                  value={fields.invoiceCity}
                  editing={isEditing}
                  testId="klant-modal-invoiceCity"
                  onChange={(value) => setField('invoiceCity', value)}
                />
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('klantenLabelPrijsgroep')}
              <select
                value={prijsgroepId}
                onChange={(event) => setPrijsgroepId(event.target.value)}
                data-testid="klant-modal-prijsgroep"
                className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
              >
                <option value="" disabled>
                  {t('klantenLabelPrijsgroep')}
                </option>
                {(prijsgroepen ?? []).map((prijsgroep) => (
                  <option key={prijsgroep.id} value={prijsgroep.id}>
                    {prijsgroep.naam}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('klantenLabelExclusieveKunstenaars')}
            </legend>
            {(kunstenaars ?? []).map((kunstenaar) => (
              <label key={kunstenaar.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={exclusieveKunstenaarIds.includes(kunstenaar.id)}
                  onChange={() => toggleExclusiviteit(kunstenaar.id)}
                  data-testid={`klant-modal-exclusief-${kunstenaar.id}`}
                />
                {kunstenaar.naam}
              </label>
            ))}
          </fieldset>

          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('klantenLabelMinimaleAfname')}
              <input
                type="number"
                min={1}
                value={minimaleAfname}
                onChange={(event) => setMinimaleAfname(event.target.value)}
                data-testid="klant-modal-minimale-afname"
                className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          {error && (
            <p data-testid="klant-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Veld({
  label,
  value,
  editing,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  testId?: string;
  onChange?: (value: string) => void;
}) {
  if (editing && onChange) {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-white/60">{label}</span>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          data-testid={testId}
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-white/60">{label}</span>
      <span className="text-white/90">{value || '—'}</span>
    </div>
  );
}
