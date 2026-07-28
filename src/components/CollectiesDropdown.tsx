'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useApiCollection } from '@/lib/useApiCollection';
import type { Segment } from './beheer/materiaalTypes';

export function CollectiesDropdown() {
  const t = useTranslations('nav');
  const [isOpen, setIsOpen] = useState(false);
  const segmenten = useApiCollection<Segment>('segmenten');

  return (
    <div
      data-testid="collections-dropdown-trigger"
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      <Link
        href="/collecties"
        data-testid="nav-collections"
        className="hover:text-gold"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {t('collections')}
      </Link>
      {isOpen && segmenten.items && segmenten.items.length > 0 && (
        <div
          data-testid="collections-dropdown"
          className="absolute left-0 top-full z-30 min-w-[180px] rounded-sm border border-white/10 bg-charcoal py-2 shadow-lg"
        >
          {segmenten.items.map((segment) => (
            <Link
              key={segment.id}
              href={`/collecties?segment=${segment.id}`}
              data-testid={`collections-dropdown-item-${segment.id}`}
              className="block px-4 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-gold"
            >
              {segment.omschrijving}
            </Link>
          ))}
          <Link
            href="/collecties"
            data-testid="collections-dropdown-item-all"
            className="block border-t border-white/10 px-4 py-2 text-xs text-gold hover:text-gold-bright"
          >
            {t('allCollectionsLink')}
          </Link>
        </div>
      )}
    </div>
  );
}
