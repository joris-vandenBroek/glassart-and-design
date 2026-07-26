'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { useDrukkerZendingen } from '@/lib/useDrukkerZendingen';
import type { Drukker } from './materiaalTypes';

type ModalState = { mode: 'add' } | { mode: 'edit'; drukker: Drukker } | null;

interface DrukkerModalProps {
  state: ModalState;
  onClose: () => void;
  onAdd: (data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

interface FormFields {
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
}

const EMPTY_FIELDS: FormFields = { naam: '', adres: '', postcode: '', plaats: '', email: '', prijsafspraken: '' };

export function DrukkerModal({ state, onClose, onAdd, onUpdate, onRemove }: DrukkerModalProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedZendingId, setExpandedZendingId] = useState<string | null>(null);
  const drukkerId = state?.mode === 'edit' ? state.drukker.id : null;
  const { zendingen, error: zendingenError } = useDrukkerZendingen(drukkerId);

  useEffect(() => {
    if (state?.mode === 'edit') {
      const { naam, adres, postcode, plaats, email, prijsafspraken } = state.drukker;
      setFields({ naam, adres, postcode, plaats, email, prijsafspraken });
    } else if (state?.mode === 'add') {
      setFields(EMPTY_FIELDS);
    }
    setActionError(null);
    setExpandedZendingId(null);
  }, [state]);

  function setField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!state) return;
    const success = state.mode === 'add' ? await onAdd(fields) : await onUpdate(state.drukker.id, fields);
    if (success) {
      void logActiviteit(
        state.mode === 'add' ? 'drukker_toegevoegd' : 'drukker_gewijzigd',
        actorFromMedewerker(user),
        fields.naam
      );
      onClose();
    } else {
      setActionError(t('drukkersActionError'));
    }
  }

  async function handleRemove() {
    if (state?.mode !== 'edit') return;
    if ((zendingen?.length ?? 0) > 0) {
      setActionError(t('drukkersVerwijderBlocked'));
      return;
    }
    const success = await onRemove(state.drukker.id);
    if (success) {
      void logActiviteit('drukker_verwijderd', actorFromMedewerker(user), state.drukker.naam);
      onClose();
    } else {
      setActionError(t('drukkersActionError'));
    }
  }

  return (
    <Modal isOpen={state !== null} onClose={onClose} closeLabel={t('modalClose')} title={t('drukkersModalTitel')}>
      <div data-testid="drukker-modal" className="flex flex-col gap-2 text-sm text-white/80">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          {t('drukkersLabelNaam')}
          <input
            type="text"
            value={fields.naam}
            onChange={(event) => setField('naam', event.target.value)}
            data-testid="drukker-modal-naam"
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          {t('drukkersLabelAdres')}
          <input
            type="text"
            value={fields.adres}
            onChange={(event) => setField('adres', event.target.value)}
            data-testid="drukker-modal-adres"
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('drukkersLabelPostcode')}
            <input
              type="text"
              value={fields.postcode}
              onChange={(event) => setField('postcode', event.target.value)}
              data-testid="drukker-modal-postcode"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('drukkersLabelPlaats')}
            <input
              type="text"
              value={fields.plaats}
              onChange={(event) => setField('plaats', event.target.value)}
              data-testid="drukker-modal-plaats"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          {t('drukkersLabelEmail')}
          <input
            type="email"
            value={fields.email}
            onChange={(event) => setField('email', event.target.value)}
            data-testid="drukker-modal-email"
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          {t('drukkersLabelPrijsafspraken')}
          <textarea
            value={fields.prijsafspraken}
            onChange={(event) => setField('prijsafspraken', event.target.value)}
            data-testid="drukker-modal-prijsafspraken"
            rows={4}
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>

        {actionError && (
          <p data-testid="drukker-modal-error" className="text-xs text-red-400">
            {actionError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!fields.naam || !fields.email}
            data-testid="drukker-modal-opslaan"
            className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('drukkersOpslaan')}
          </button>
          {state?.mode === 'edit' && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={zendingen === null}
              data-testid="drukker-modal-verwijderen"
              className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('drukkersVerwijderen')}
            </button>
          )}
        </div>

        {state?.mode === 'edit' && (
          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <span className="text-xs uppercase tracking-wide text-white/60">{t('drukkersZendingenTitel')}</span>
            {zendingenError ? (
              <p data-testid="drukker-modal-zendingen-error" className="text-xs text-red-400">
                {t('drukkersActionError')}
              </p>
            ) : zendingen === null ? null : zendingen.length === 0 ? (
              <p data-testid="drukker-modal-zendingen-leeg" className="text-white/50">
                {t('drukkersZendingenLeeg')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {zendingen.map((zending) => (
                  <li key={zending.id} data-testid={`drukker-zending-${zending.id}`} className="rounded-sm bg-black/30 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''} —{' '}
                        {t('drukkersZendingenSamenvatting', {
                          klanten: zending.aantalKlanten,
                          regels: zending.aantalRegels,
                        })}
                      </span>
                      <button
                        type="button"
                        data-testid={`drukker-zending-bekijken-${zending.id}`}
                        onClick={() =>
                          setExpandedZendingId((current) => (current === zending.id ? null : zending.id))
                        }
                        className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                      >
                        {expandedZendingId === zending.id
                          ? t('drukkersZendingenVerbergen')
                          : t('drukkersZendingenBekijken')}
                      </button>
                    </div>
                    {expandedZendingId === zending.id && (
                      <pre className="mt-2 whitespace-pre-wrap text-white/70">{zending.body}</pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
