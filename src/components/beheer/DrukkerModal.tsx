'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { HelpLink } from '@/components/HelpLink';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit } from '@/lib/logActiviteit';
import { useDrukkerZendingen, type DrukkerZending } from '@/lib/useDrukkerZendingen';
import { ZendingBekijkenModal } from './ZendingBekijkenModal';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';
import type { Bestelling } from './BestellingenSection';
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';

type ModalState = { mode: 'add' } | { mode: 'edit'; drukker: Drukker } | null;

interface DrukkerModalProps {
  state: ModalState;
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  onClose: () => void;
  // drukkernr is server-eigendom (zie POST/PATCH /api/drukkers, die het uit de body
  // weggooien) -- de modal verzamelt en verstuurt het dus niet.
  onAdd: (data: Omit<Drukker, 'id' | 'drukkernr'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Drukker, 'id' | 'drukkernr'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onBestellingUpdated: (bestelling: Bestelling) => void;
}

interface FormFields {
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email: string;
  prijsafspraken: string;
  standaard: boolean;
}

const EMPTY_FIELDS: FormFields = { naam: '', adres: '', postcode: '', plaats: '', email: '', prijsafspraken: '', standaard: false };

export function DrukkerModal({
  state,
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  klanten,
  btwTarieven,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
  onBestellingUpdated,
}: DrukkerModalProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewingZending, setViewingZending] = useState<DrukkerZending | null>(null);
  const [zendingActionError, setZendingActionError] = useState<{ zendingId: string; message: string } | null>(
    null
  );
  const drukkerId = state?.mode === 'edit' ? state.drukker.id : null;
  const { zendingen, error: zendingenError } = useDrukkerZendingen(drukkerId);

  useEffect(() => {
    if (state?.mode === 'edit') {
      const { naam, adres, postcode, plaats, email, prijsafspraken, standaard } = state.drukker;
      setFields({ naam, adres, postcode, plaats, email, prijsafspraken, standaard: standaard ?? false });
    } else if (state?.mode === 'add') {
      setFields(EMPTY_FIELDS);
    }
    setActionError(null);
    setViewingZending(null);
    setZendingActionError(null);
  }, [state]);

  function afgerondCounts(zending: DrukkerZending): { afgerond: number; totaal: number } | null {
    if (bestellingen === null) return null;
    const orders = zending.bestellingIds
      .map((bestelnr) => bestellingen.find((b) => b.bestelnr === bestelnr))
      .filter((b): b is Bestelling => b != null);
    return {
      afgerond: orders.filter((b) => b.status === 'Te factureren' || b.status === 'Betaald en afgerond').length,
      totaal: zending.bestellingIds.length,
    };
  }

  async function handleMarkeerZendingAlsAfgerond(zending: DrukkerZending) {
    setZendingActionError(null);
    if (bestellingen === null) {
      setZendingActionError({
        zendingId: zending.id,
        message: t('drukkersMarkeerZendingAlsAfgerondError', { afgerond: 0, totaal: zending.bestellingIds.length }),
      });
      return;
    }
    const orders = zending.bestellingIds
      .map((bestelnr) => bestellingen.find((b) => b.bestelnr === bestelnr))
      .filter((b): b is Bestelling => b != null);
    const teAfronden = orders.filter((b) => b.status === 'Verstuurd naar drukker');
    if (teAfronden.length === 0) {
      const alleAfgerond =
        orders.length === zending.bestellingIds.length &&
        orders.every((b) => b.status === 'Te factureren' || b.status === 'Betaald en afgerond');
      if (!alleAfgerond) {
        setZendingActionError({
          zendingId: zending.id,
          message: t('drukkersMarkeerZendingAlsAfgerondError', { afgerond: 0, totaal: zending.bestellingIds.length }),
        });
      }
      return;
    }
    let afgerond = 0;
    for (const bestelling of teAfronden) {
      try {
        const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'Te factureren' }),
        });
        if (!response.ok) throw new Error('update failed');
        void logActiviteit('bestelling_afgerond', bestelling.bestelnr);
        onBestellingUpdated({ ...bestelling, status: 'Te factureren' });
        afgerond += 1;
      } catch {
        setZendingActionError({
          zendingId: zending.id,
          message: t('drukkersMarkeerZendingAlsAfgerondError', { afgerond, totaal: teAfronden.length }),
        });
        return;
      }
    }
  }

  function setField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!state) return;
    const success = state.mode === 'add' ? await onAdd(fields) : await onUpdate(state.drukker.id, fields);
    if (success) {
      void logActiviteit(
        state.mode === 'add' ? 'drukker_toegevoegd' : 'drukker_gewijzigd',
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
      void logActiviteit('drukker_verwijderd', state.drukker.naam);
      onClose();
    } else {
      setActionError(t('drukkersActionError'));
    }
  }

  return (
    <>
    <Modal
      isOpen={state !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={
        <span className="flex w-full items-center justify-between gap-2 pr-2">
          {t('drukkersModalTitel')}
          <HelpLink anchor="drukkers-standaard" label="Open het hoofdstuk over drukkers" testId="drukker-modal-help" />
        </span>
      }
      subtitle={
        state?.mode === 'edit' ? (
          <span data-testid="drukker-modal-drukkernr">{state.drukker.drukkernr}</span>
        ) : undefined
      }
      footerActions={
        <>
          <button
            type="button"
            onClick={handleSave}
            disabled={!fields.naam || !fields.email}
            data-testid="drukker-modal-opslaan"
            className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('drukkersOpslaan')}
          </button>
          {state?.mode === 'edit' && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={zendingen === null}
              data-testid="drukker-modal-verwijderen"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('drukkersVerwijderen')}
            </button>
          )}
        </>
      }
    >
      <div data-testid="drukker-modal" className="flex flex-col gap-2 text-sm text-white/80">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          <span>
            {t('drukkersLabelNaam')}
            <RequiredMark />
          </span>
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
          <span>
            {t('drukkersLabelEmail')}
            <RequiredMark />
          </span>
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
        <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
          <input
            type="checkbox"
            checked={fields.standaard}
            onChange={(event) => setField('standaard', event.target.checked)}
            data-testid="drukker-modal-standaard"
          />
          {t('drukkersLabelStandaard')}
        </label>

        <RequiredLegend testId="drukker-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

        {actionError && (
          <p data-testid="drukker-modal-error" className="text-xs text-red-400">
            {actionError}
          </p>
        )}

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
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {zendingen.map((zending) => {
                  const counts = afgerondCounts(zending);
                  return (
                    <li key={zending.id} data-testid={`drukker-zending-${zending.id}`} className="rounded-sm bg-black/30 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {zending.zendingnummer && `${zending.zendingnummer} — `}
                          {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''} —{' '}
                          {t('drukkersZendingenSamenvatting', {
                            klanten: zending.aantalKlanten,
                            regels: zending.aantalRegels,
                          })}
                        </span>
                        <button
                          type="button"
                          data-testid={`drukker-zending-bekijken-${zending.id}`}
                          onClick={() => setViewingZending(zending)}
                          className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                        >
                          {t('drukkersZendingenBekijken')}
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {counts && (
                          <>
                            <span
                              data-testid={`drukker-zending-afgerond-badge-${zending.id}`}
                              className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
                            >
                              {t('drukkersZendingAfgerondBadge', { afgerond: counts.afgerond, totaal: counts.totaal })}
                            </span>
                            {counts.afgerond < counts.totaal && (
                              <button
                                type="button"
                                data-testid={`drukker-zending-afronden-${zending.id}`}
                                onClick={() => handleMarkeerZendingAlsAfgerond(zending)}
                                className="shrink-0 text-white/50 underline underline-offset-2 hover:text-white"
                              >
                                {t('drukkersMarkeerZendingAlsAfgerond')}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {zendingActionError?.zendingId === zending.id && (
                        <p data-testid="drukker-zending-afronden-error" className="mt-1.5 text-red-400">
                          {zendingActionError.message}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
    <ZendingBekijkenModal
      zending={viewingZending}
      bestellingen={bestellingen}
      kunstwerken={kunstwerken}
      materialen={materialen}
      maten={maten}
      materiaalsoorten={materiaalsoorten}
      klanten={klanten}
      btwTarieven={btwTarieven}
      onClose={() => setViewingZending(null)}
    />
    </>
  );
}
