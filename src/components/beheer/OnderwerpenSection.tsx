'use client';

import { LookupSection } from './LookupSection';
import type { Onderwerp, Kunstwerk } from './materiaalTypes';

interface OnderwerpenSectionProps {
  onderwerpen: Onderwerp[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

export function OnderwerpenSection({
  onderwerpen,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: OnderwerpenSectionProps) {
  return (
    <LookupSection<Onderwerp>
      items={onderwerpen}
      kunstwerken={kunstwerken}
      loadError={loadError}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={onRemove}
      enkelvoud="onderwerp"
      meervoud="onderwerpen"
      kunstwerkIdsKey="onderwerpIds"
      activiteitTypes={{
        toegevoegd: 'onderwerp_toegevoegd',
        gewijzigd: 'onderwerp_gewijzigd',
        verwijderd: 'onderwerp_verwijderd',
      }}
    />
  );
}
