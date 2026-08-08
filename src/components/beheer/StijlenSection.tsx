'use client';

import { LookupSection } from './LookupSection';
import type { Stijl, Kunstwerk } from './materiaalTypes';

interface StijlenSectionProps {
  stijlen: Stijl[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

export function StijlenSection({
  stijlen,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: StijlenSectionProps) {
  return (
    <LookupSection<Stijl>
      items={stijlen}
      kunstwerken={kunstwerken}
      loadError={loadError}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={onRemove}
      enkelvoud="stijl"
      meervoud="stijlen"
      kunstwerkIdsKey="stijlIds"
      activiteitTypes={{
        toegevoegd: 'stijl_toegevoegd',
        gewijzigd: 'stijl_gewijzigd',
        verwijderd: 'stijl_verwijderd',
      }}
    />
  );
}
