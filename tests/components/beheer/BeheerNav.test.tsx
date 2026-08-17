import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BeheerNav, type BeheerSection } from '@/components/beheer/BeheerNav';
import messages from '../../../messages/nl.json';

function renderNav(
  activeSection: BeheerSection = 'klanten',
  overrideCounts?: Partial<Record<`${BeheerSection}Count`, number>>
) {
  const onSelect = vi.fn();
  const onLogout = vi.fn();
  const defaultCounts = {
    klantenCount: 3,
    bestellingenCount: 5,
    materiaalsoortenCount: 4,
    materialenCount: 6,
    matenCount: 2,
    segmentenCount: 6,
    stijlenCount: 5,
    categorieenCount: 4,
    kunstwerkenCount: 36,
    kunstenaarsCount: 8,
    prijsgroepenCount: 9,
    drukkersCount: 7,
    activiteitCount: 12,
  };
  const counts = { ...defaultCounts, ...overrideCounts };
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BeheerNav
        activeSection={activeSection}
        onSelect={onSelect}
        onLogout={onLogout}
        klantenCount={counts.klantenCount}
        bestellingenCount={counts.bestellingenCount}
        materiaalsoortenCount={counts.materiaalsoortenCount}
        materialenCount={counts.materialenCount}
        matenCount={counts.matenCount}
        segmentenCount={counts.segmentenCount}
        stijlenCount={counts.stijlenCount}
        categorieenCount={counts.categorieenCount}
        kunstwerkenCount={counts.kunstwerkenCount}
        kunstenaarsCount={counts.kunstenaarsCount}
        prijsgroepenCount={counts.prijsgroepenCount}
        drukkersCount={counts.drukkersCount}
        activiteitCount={counts.activiteitCount}
      />
    </NextIntlClientProvider>
  );
  return { onSelect, onLogout };
}

describe('BeheerNav', () => {
  it('renders the 12 active items with their counters, and no disabled placeholder items', () => {
    renderNav();
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('Klanten');
    expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('3');
    expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('Bestellingen');
    expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('5');
    expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('Materiaalsoorten');
    expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('Materialen');
    expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('Maten');
    expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('Segmenten');
    expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('6');
    expect(screen.getByTestId('beheer-nav-stijlen')).toHaveTextContent('Stijlen');
    expect(screen.getByTestId('beheer-nav-stijlen')).toHaveTextContent('5');
    expect(screen.getByTestId('beheer-nav-categorieen')).toHaveTextContent('Categorieën');
    expect(screen.getByTestId('beheer-nav-categorieen')).toHaveTextContent('4');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('Kunstwerken');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('36');
    expect(screen.getByTestId('beheer-nav-kunstenaars')).toHaveTextContent('Kunstenaars');
    expect(screen.getByTestId('beheer-nav-kunstenaars')).toHaveTextContent('8');
    expect(screen.getByTestId('beheer-nav-prijsgroepen')).toHaveTextContent('Prijsgroepen');
    expect(screen.getByTestId('beheer-nav-prijsgroepen')).toHaveTextContent('9');
    expect(screen.getByTestId('beheer-nav-prijsmatrix')).toHaveTextContent('Prijsmatrix');
    expect(screen.getByTestId('beheer-nav-drukkers')).toHaveTextContent('Drukkers');
    expect(screen.getByTestId('beheer-nav-drukkers')).toHaveTextContent('7');
    expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('Activiteitenlog');
    expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('12');
    expect(screen.getByTestId('beheer-nav-glassartDesign')).toHaveTextContent('Glassart and Design');
    expect(screen.getByTestId('beheer-nav-glassartDesign')).not.toBeDisabled();
    expect(screen.getByTestId('beheer-nav-instellingen')).toHaveTextContent('Instellingen');
    expect(screen.getByTestId('beheer-nav-instellingen')).not.toBeDisabled();
  });

  it('does not show a count badge on the Glassart & Design item', () => {
    renderNav();
    const item = screen.getByTestId('beheer-nav-glassartDesign');
    expect(item.querySelectorAll('span')).toHaveLength(1);
  });

  it('does not show a count badge on the Instellingen item', () => {
    renderNav();
    const item = screen.getByTestId('beheer-nav-instellingen');
    expect(item.querySelectorAll('span')).toHaveLength(1);
  });

  it('does not show a count badge on the Prijsmatrix item', () => {
    renderNav();
    const item = screen.getByTestId('beheer-nav-prijsmatrix');
    expect(item.querySelectorAll('span')).toHaveLength(1);
  });

  it('marks the active section with aria-current', () => {
    renderNav('kunstwerken');
    expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('beheer-nav-klanten')).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the clicked section id', () => {
    const { onSelect } = renderNav();
    fireEvent.click(screen.getByTestId('beheer-nav-bestellingen'));
    expect(onSelect).toHaveBeenCalledWith('bestellingen');
    fireEvent.click(screen.getByTestId('beheer-nav-segmenten'));
    expect(onSelect).toHaveBeenCalledWith('segmenten');
  });

  it('calls onLogout when the logout button is clicked', () => {
    const { onLogout } = renderNav();
    fireEvent.click(screen.getByTestId('beheer-nav-logout'));
    expect(onLogout).toHaveBeenCalled();
  });

  it('renders a badge with count of 0', () => {
    renderNav('materiaalsoorten', { materiaalsoortenCount: 0 });
    const item = screen.getByTestId('beheer-nav-materiaalsoorten');
    expect(item).toHaveTextContent('0');
  });

  it('keeps the Stamgegevens group closed by default and toggles it open/closed on click', () => {
    renderNav();
    const toggle = screen.getByTestId('beheer-nav-group-stamgegevens');
    const items = screen.getByTestId('beheer-nav-group-stamgegevens-items');
    expect(toggle).toHaveTextContent('Stamgegevens');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(items).not.toBeVisible();
    expect(items).toHaveClass('hidden');
    expect(items).not.toHaveClass('flex');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(items).toBeVisible();
    expect(items).toHaveClass('flex');
    expect(items).not.toHaveClass('hidden');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(items).not.toBeVisible();
    expect(items).toHaveClass('hidden');
    expect(items).not.toHaveClass('flex');
  });

  it('auto-opens the Stamgegevens group when the active section is inside it', () => {
    renderNav('segmenten');
    expect(screen.getByTestId('beheer-nav-group-stamgegevens')).toHaveAttribute('aria-expanded', 'true');
    const items = screen.getByTestId('beheer-nav-group-stamgegevens-items');
    expect(items).toBeVisible();
    expect(items).toHaveClass('flex');
    expect(items).not.toHaveClass('hidden');
  });

  it('does not auto-open the Stamgegevens group for a top-level active section', () => {
    renderNav('drukkers');
    expect(screen.getByTestId('beheer-nav-group-stamgegevens')).toHaveAttribute('aria-expanded', 'false');
    const items = screen.getByTestId('beheer-nav-group-stamgegevens-items');
    expect(items).not.toBeVisible();
    expect(items).toHaveClass('hidden');
    expect(items).not.toHaveClass('flex');
  });

  it('renders all 7 grouped items inside the Stamgegevens group with their counters', () => {
    renderNav();
    const items = screen.getByTestId('beheer-nav-group-stamgegevens-items');
    expect(items).toContainElement(screen.getByTestId('beheer-nav-materiaalsoorten'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-materialen'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-maten'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-segmenten'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-stijlen'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-categorieen'));
    expect(items).toContainElement(screen.getByTestId('beheer-nav-prijsgroepen'));
  });

  it('keeps Drukkers, Glassart and Design and Instellingen outside the Stamgegevens group', () => {
    renderNav();
    const items = screen.getByTestId('beheer-nav-group-stamgegevens-items');
    expect(items).not.toContainElement(screen.getByTestId('beheer-nav-drukkers'));
    expect(items).not.toContainElement(screen.getByTestId('beheer-nav-glassartDesign'));
    expect(items).not.toContainElement(screen.getByTestId('beheer-nav-instellingen'));
  });
});
