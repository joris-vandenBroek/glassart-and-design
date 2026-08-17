'use client';

import { LookupSection } from './LookupSection';
import type { Categorie, Kunstwerk } from './materiaalTypes';

interface CategorieenSectionProps {
  categorieen: Categorie[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Categorie, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Categorie, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

export function CategorieenSection({
  categorieen,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: CategorieenSectionProps) {
  return (
    <LookupSection<Categorie>
      items={categorieen}
      kunstwerken={kunstwerken}
      loadError={loadError}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={onRemove}
      enkelvoud="categorie"
      meervoud="categorieen"
      kunstwerkIdsKey="categorieIds"
      activiteitTypes={{
        toegevoegd: 'categorie_toegevoegd',
        gewijzigd: 'categorie_gewijzigd',
        verwijderd: 'categorie_verwijderd',
      }}
    />
  );
}
