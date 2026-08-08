'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { Combobox } from '@/components/Combobox';
import { HelpHint } from '@/components/HelpHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { LAND_OPTIONS, landNaam } from '@/data/landen';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import { normaliseerBtwNummer, valideerBtwNummer } from '@/lib/btwNummer';
import type { Klant } from './KlantenSection';
import type { Prijsgroep } from './materiaalTypes';
import type { Kunstenaar } from './kunstenaarTypes';
import type { BtwTarieven } from './btwTarievenTypes';

const STATUS_BADGE_CLASS: Record<Klant['status'], string> = {
  Beoordelen: 'bg-amber-400/10 text-amber-300',
  Goedgekeurd: 'bg-green-500/10 text-green-400',
  Afgewezen: 'bg-red-400/10 text-red-400',
};

interface EditableFields {
  companyName: string;
  kvk: string;
  btwNummer: string;
  contactPerson: string;
  contactPreference: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  land: string;
  deliveryAddress: string;
  deliveryPostcode: string;
  deliveryCity: string;
  invoiceAddress: string;
  invoicePostcode: string;
  invoiceCity: string;
  invoiceLand: string;
}

function fieldsFromKlant(klant: Klant): EditableFields {
  return {
    companyName: klant.companyName,
    kvk: klant.kvk,
    btwNummer: klant.btwNummer ?? '',
    contactPerson: klant.contactPerson,
    contactPreference: klant.contactPreference,
    email: klant.email,
    phone: klant.phone,
    address: klant.address,
    postcode: klant.postcode,
    city: klant.city,
    land: klant.land ?? '',
    deliveryAddress: klant.deliveryAddress,
    deliveryPostcode: klant.deliveryPostcode,
    deliveryCity: klant.deliveryCity,
    invoiceAddress: klant.invoiceAddress,
    invoicePostcode: klant.invoicePostcode,
    invoiceCity: klant.invoiceCity,
    invoiceLand: klant.invoiceLand ?? '',
  };
}

interface KlantModalProps {
  klant: Klant | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  btwLoadError: boolean;
  onClose: () => void;
  onUpdated: (klant: Klant) => void;
}

export function KlantModal({
  klant,
  prijsgroepen,
  kunstenaars,
  klanten,
  btwTarieven,
  btwLoadError,
  onClose,
  onUpdated,
}: KlantModalProps) {
  const t = useTranslations('beheer');
  const [prijsgroepId, setPrijsgroepId] = useState('');
  const [kunstenaarId, setKunstenaarId] = useState<string | null>(null);
  const [minimaleAfname, setMinimaleAfname] = useState('');
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  const land = fields ? fields.invoiceLand || fields.land || null : null;
  const btwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
  // While btwTarieven hasn't loaded yet (still null) and no load error has occurred, don't treat
  // that as "no matching tarief" — only flag a real mismatch once the data has actually loaded, or
  // once we know for certain the load failed. Fail closed on error, not open: a load error must
  // never silently disable this entire blockade.
  const heeftGeldigBtwTarief = (btwTarieven === null && !btwLoadError) || btwPercentage !== null;

  useEffect(() => {
    if (klant) {
      setPrijsgroepId(klant.prijsgroepId ?? '');
      setKunstenaarId(klant.kunstenaarId);
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

  function handleKunstenaarChange(nextKunstenaarId: string | null) {
    if (nextKunstenaarId) {
      const alreadyClaimedBy = (klanten ?? []).find(
        (other) => other.id !== klant?.id && other.kunstenaarId === nextKunstenaarId
      );
      if (alreadyClaimedBy) {
        setError(t('klantenKunstenaarBlocked'));
        return;
      }
    }
    setError(null);
    setKunstenaarId(nextKunstenaarId);
  }

  async function handleOpslaan() {
    if (!klant || !fields) return;
    setError(null);

    const origineleFields = fieldsFromKlant(klant);

    // Format only -- an empty value stays allowed here, because existing EU klanten have
    // no VAT number yet and would otherwise be impossible to save at all. See the spec, section D.
    // Only checked when btwNummer or land is actually part of this save: the prijsgroep <select>
    // and kunstenaar <Combobox> below aren't gated behind isEditing, so re-validating an untouched,
    // already-stored btwNummer/land pair on every save would block a staff member from e.g. just
    // linking a kunstenaar on a record that happens to have a mismatched legacy VAT number.
    const genormaliseerdBtwNummer = normaliseerBtwNummer(fields.btwNummer);
    const btwOfLandGewijzigd =
      fields.btwNummer !== origineleFields.btwNummer || fields.land !== origineleFields.land;
    if (btwOfLandGewijzigd && valideerBtwNummer(genormaliseerdBtwNummer, fields.land) === 'ongeldig') {
      setError(t('klantenBtwNummerOngeldig'));
      return;
    }
    const teBewarenFields = { ...fields, btwNummer: genormaliseerdBtwNummer };

    const veldenGewijzigd =
      isEditing && (Object.keys(origineleFields) as (keyof EditableFields)[]).some((key) => fields[key] !== origineleFields[key]);
    const prijsgroepGewijzigd =
      klant.status === 'Goedgekeurd' && prijsgroepId !== '' && prijsgroepId !== (klant.prijsgroepId ?? '');
    const kunstenaarIdGewijzigd = kunstenaarId !== (klant.kunstenaarId ?? null);
    const trimmedMinimaleAfname = minimaleAfname.trim();
    const parsedMinimaleAfname =
      trimmedMinimaleAfname === '' ? null : Math.max(1, Math.round(Number(trimmedMinimaleAfname)) || 1);
    const minimaleAfnameGewijzigd = parsedMinimaleAfname !== (klant.minimaleAfname ?? null);

    if (!veldenGewijzigd && !prijsgroepGewijzigd && !kunstenaarIdGewijzigd && !minimaleAfnameGewijzigd) {
      setIsEditing(false);
      return;
    }

    try {
      const updates: Partial<Klant> = {};
      if (veldenGewijzigd) Object.assign(updates, teBewarenFields);
      if (prijsgroepGewijzigd) updates.prijsgroepId = prijsgroepId;
      if (kunstenaarIdGewijzigd) updates.kunstenaarId = kunstenaarId;
      if (minimaleAfnameGewijzigd) updates.minimaleAfname = parsedMinimaleAfname;

      const response = await fetch(`/api/klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('update failed');

      if (veldenGewijzigd) void logActiviteit('klant_gewijzigd', actorFromMedewerker(user), klant.companyName);
      if (prijsgroepGewijzigd) void logActiviteit('klant_prijsgroep_gewijzigd', actorFromMedewerker(user), klant.companyName);
      if (kunstenaarIdGewijzigd) void logActiviteit('klant_kunstenaarkoppeling_gewijzigd', actorFromMedewerker(user), klant.companyName);
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
      // Het klantnummer is een weergave-extraatje: een respons zonder bruikbare
      // JSON mag een geslaagde goedkeuring nooit alsnog laten mislukken.
      const body = (await response.json().catch(() => ({}))) as { klantnr?: string | null };
      const klantnr = body.klantnr ?? klant.klantnr ?? null;
      void logActiviteit(
        'klant_goedgekeurd',
        actorFromMedewerker(user),
        klantnr ? `${klant.companyName} (${klantnr})` : klant.companyName
      );
      onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroepId, klantnr });
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
      title={
        <span className="inline-flex items-center gap-2">
          {t('klantenModalTitel')}
          <HelpHint text={t('klantenHelp')} testId="klant-modal-help" />
        </span>
      }
      subtitle={
        klant?.klantnr ? <span data-testid="klant-modal-klantnr">{klant.klantnr}</span> : undefined
      }
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
                disabled={!prijsgroepId || !heeftGeldigBtwTarief}
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

          {!heeftGeldigBtwTarief && (
            <p data-testid="klant-modal-btw-waarschuwing" className="text-xs text-amber-400">
              {btwLoadError
                ? t('klantenBtwWaarschuwingLaadfout')
                : land === null
                  ? t('klantenBtwWaarschuwingGeenLand')
                  : t('klantenBtwWaarschuwing', { land: landNaam(land) })}
            </p>
          )}

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
              label={t('klantenColBtwNummer')}
              value={fields.btwNummer}
              editing={isEditing}
              testId="klant-modal-btwNummer"
              onChange={(value) => setField('btwNummer', value)}
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
            {isEditing ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-white/60">{t('klantenLabelLand')}</span>
                <Combobox
                  options={LAND_OPTIONS}
                  value={fields.land || null}
                  onChange={(value) => setField('land', value ?? '')}
                  placeholder={t('klantenLabelLand')}
                  noResultsLabel={t('klantenLabelLand')}
                  testId="klant-modal-land"
                />
              </label>
            ) : (
              <Veld label={t('klantenLabelLand')} value={landNaam(fields.land)} editing={false} />
            )}
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
                {isEditing ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-white/60">
                      {t('klantenLabelLand')}
                    </span>
                    <Combobox
                      options={LAND_OPTIONS}
                      value={fields.invoiceLand || null}
                      onChange={(value) => setField('invoiceLand', value ?? '')}
                      placeholder={t('klantenLabelLand')}
                      noResultsLabel={t('klantenLabelLand')}
                      clearLabel={t('klantenLabelGebruiktStandaardadres')}
                      testId="klant-modal-invoiceLand"
                    />
                  </label>
                ) : (
                  <Veld label={t('klantenLabelLand')} value={landNaam(fields.invoiceLand)} editing={false} />
                )}
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              <span>
                {t('klantenLabelPrijsgroep')}
                <RequiredMark />
              </span>
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

          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              {t('klantenLabelKunstenaar')}
              <Combobox
                options={(kunstenaars ?? []).map((kunstenaar) => ({ value: kunstenaar.id, label: kunstenaar.naam }))}
                value={kunstenaarId}
                onChange={handleKunstenaarChange}
                placeholder={t('klantenKunstenaarPlaceholder')}
                noResultsLabel={t('klantenKunstenaarGeenResultaten')}
                clearLabel={t('klantenKunstenaarGeen')}
                testId="klant-modal-kunstenaar"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-white/60">
              {t('klantenLabelExclusieveKunstenaars')}
            </span>
            {(() => {
              const namen = (kunstenaars ?? [])
                .filter((kunstenaar) => kunstenaar.exclusieveKlantIds.includes(klant.id))
                .map((kunstenaar) => kunstenaar.naam);
              return namen.length === 0 ? (
                <p data-testid="klant-modal-exclusieve-kunstenaars-leeg" className="text-white/50">
                  {t('klantenExclusieveKunstenaarsLeeg')}
                </p>
              ) : (
                <p data-testid="klant-modal-exclusieve-kunstenaars">{namen.join(', ')}</p>
              );
            })()}
          </div>

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

          <RequiredLegend testId="klant-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

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
