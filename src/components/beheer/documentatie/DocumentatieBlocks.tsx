import type { ReactNode } from 'react';

export function Chapter({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-silver-dim/60 pt-10 first:border-t-0 first:pt-0">
      <h2 className="font-head text-2xl text-ink">{title}</h2>
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function SubSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-8 flex flex-col gap-2">
      <h3 className="font-head text-lg text-ink">{title}</h3>
      {children}
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="font-body leading-relaxed text-charcoal/90">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1 pl-5 font-body leading-relaxed text-charcoal/90">{children}</ul>;
}

export function DocLink({ anchor, children }: { anchor: string; children: ReactNode }) {
  return (
    <a href={`#${anchor}`} className="text-gold underline decoration-gold/40 underline-offset-2 hover:text-gold-bright">
      {children}
    </a>
  );
}
