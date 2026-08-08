'use client';

import { LookupSection } from './LookupSection';
import type { Segment, Kunstwerk } from './materiaalTypes';

interface SegmentenSectionProps {
  segmenten: Segment[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Segment, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Segment, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

export function SegmentenSection({
  segmenten,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: SegmentenSectionProps) {
  return (
    <LookupSection<Segment>
      items={segmenten}
      kunstwerken={kunstwerken}
      loadError={loadError}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={onRemove}
      enkelvoud="segment"
      meervoud="segmenten"
      kunstwerkIdsKey="segmentIds"
      activiteitTypes={{
        toegevoegd: 'segment_toegevoegd',
        gewijzigd: 'segment_gewijzigd',
        verwijderd: 'segment_verwijderd',
      }}
    />
  );
}
