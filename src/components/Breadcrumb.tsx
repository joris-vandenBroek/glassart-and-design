import { Link } from '@/i18n/navigation';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="breadcrumb"
      className="mx-auto mb-6 flex max-w-5xl flex-wrap items-center gap-2 text-xs text-white/60"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-white/30">
                /
              </span>
            )}
            {item.href && !isLast ? (
              <Link href={item.href} data-testid={`breadcrumb-item-${index}`} className="hover:text-gold">
                {item.label}
              </Link>
            ) : (
              <span
                data-testid={`breadcrumb-item-${index}`}
                aria-current={isLast ? 'page' : undefined}
                className={isLast ? 'text-white' : ''}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
