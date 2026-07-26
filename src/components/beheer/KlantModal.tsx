'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Klant } from './KlantenSection';
import type { Prijsgroep } from './materiaalTypes';

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
  };
}

interface KlantModalProps {
  klant: Klant | null;
  prijsgroepen: Prijsgroep[] | null;
  onClose: () => void;
  onUpdated: (klant: Klant) => void;
}

export function KlantModal({ klant, prijsgroepen, onClose, onUpdated }: KlantModalProps) {
  const t = useTranslations('beheer');
  const [prijsgroepId, setPrijsgroepId] = useState('');
  const [minimaleAfname, setMinimaleAfname] = useState('');
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  useEffect(() => {
    if (klant) {
      setPrijsgroepId(klant.prijsgroepId ?? '');
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

  async function handleOpslaanVelden() {
    if (!klant || !fields) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { ...fields });
      void logActiviteit('klant_gewijzigd', actorFromMedewerker(user));
      onUpdated({ ...klant, ...fields });
      setIsEditing(false);
    } catch {
      setError(t('klantenActionError'));
    }
  }

  async function handleOpslaanPrijsgroep() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { prijsgroepId });
      void logActiviteit('klant_prijsgroep_gewijzigd', actorFromMedewerker(user));
      onUpdated({ ...klant, prijsgroepId });
    } catch {
      setError(t('klantenActionError'));
    }
  }

  async function handleOpslaanMinimaleAfname() {
    if (!klant) return;
    const trimmed = minimaleAfname.trim();
    const parsed = trimmed === '' ? null : Math.max(1, Math.round(Number(trimmed)) || 1);
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { minimaleAfname: parsed });
      void logActiviteit('klant_minimale_afname_gewijzigd', actorFromMedewerker(user));
      onUpdated({ ...klant, minimaleAfname: parsed });
      setMinimaleAfname(parsed != null ? String(parsed) : '');
    } catch {
      setError(t('klantenActionError'));
    }
  }

  async function handleGoedkeuren() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { status: 'Goedgekeurd', prijsgroepId });
      void logActiviteit('klant_goedgekeurd', actorFromMedewerker(user));
      onUpdated({ ...klant, status: 'Goedgekeurd', prijsgroepId });
    } catch {
      setError(t('klantenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!klant) return;
    try {
      await updateDoc(doc(db, 'klanten', klant.id), { status: 'Afgewezen' });
      void logActiviteit('klant_afgewezen', actorFromMedewerker(user));
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
                className="rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
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

          {isEditing && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleOpslaanVelden}
                data-testid="klant-modal-velden-opslaan"
                className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
              >
                {t('klantenOpslaan')}
              </button>
              <button
                type="button"
                onClick={handleAnnuleren}
                data-testid="klant-modal-annuleren"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            </div>
          )}

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
            {klant.status === 'Goedgekeurd' && (
              <button
                type="button"
                onClick={handleOpslaanPrijsgroep}
                disabled={!prijsgroepId}
                data-testid="klant-modal-prijsgroep-opslaan"
                className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('klantenOpslaan')}
              </button>
            )}
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
            <button
              type="button"
              onClick={handleOpslaanMinimaleAfname}
              data-testid="klant-modal-minimale-afname-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('klantenOpslaan')}
            </button>
          </div>

          {error && (
            <p data-testid="klant-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}

          {!isEditing && (
            <div className="flex gap-2">
              {klant.status !== 'Goedgekeurd' && (
                <button
                  type="button"
                  onClick={handleGoedkeuren}
                  disabled={!prijsgroepId}
                  data-testid="klant-modal-goedkeuren"
                  className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
                >
                  {t('klantenGoedkeuren')}
                </button>
              )}
              <button
                type="button"
                onClick={handleAfwijzen}
                data-testid="klant-modal-afwijzen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('klantenAfwijzen')}
              </button>
            </div>
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
