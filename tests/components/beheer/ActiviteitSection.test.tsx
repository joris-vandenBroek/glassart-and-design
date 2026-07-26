import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ActiviteitSection, type Activiteit } from '@/components/beheer/ActiviteitSection';
import messages from '../../../messages/nl.json';

const ACTIVITEITEN: Activiteit[] = [
  {
    id: 'log-1',
    type: 'kunstwerk_bekeken',
    actorEmail: 'klant@example.com',
    actorNaam: 'Testbedrijf BV',
    timestamp: new Date('2026-07-22T10:00:00'),
  },
  {
    id: 'log-2',
    type: 'word_klant_bezocht',
    actorEmail: 'Onbekend',
    actorNaam: 'Onbekend',
    timestamp: new Date('2026-07-22T09:00:00'),
  },
];

function renderSection(
  activiteiten: Activiteit[] | null = ACTIVITEITEN,
  loadError: string | null = null
) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <ActiviteitSection activiteiten={activiteiten} loadError={loadError} />
    </NextIntlClientProvider>
  );
}

describe('ActiviteitSection', () => {
  it('shows each activiteit with its translated type label and actor', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('Kunstwerk bekeken');
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('klant@example.com');
    expect(screen.getByTestId('data-table-row-log-2')).toHaveTextContent('Word-klantpagina bezocht');
    expect(screen.getByTestId('data-table-row-log-2')).toHaveTextContent('Onbekend');
  });

  it('shows the translated label for bedrijfsgegevens_gewijzigd', () => {
    renderSection([
      {
        id: 'log-4',
        type: 'bedrijfsgegevens_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-22T11:00:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-4')).toHaveTextContent('Bedrijfsgegevens gewijzigd');
  });

  it('shows the translated labels for the new kunstenaar and klant-exclusiviteit activity types', () => {
    renderSection([
      {
        id: 'log-5',
        type: 'kunstenaar_toegevoegd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:00:00'),
      },
      {
        id: 'log-6',
        type: 'kunstenaar_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:05:00'),
      },
      {
        id: 'log-7',
        type: 'kunstenaar_verwijderd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:10:00'),
      },
      {
        id: 'log-8',
        type: 'klant_exclusiviteit_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T09:15:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-5')).toHaveTextContent('Kunstenaar toegevoegd');
    expect(screen.getByTestId('data-table-row-log-6')).toHaveTextContent('Kunstenaar gewijzigd');
    expect(screen.getByTestId('data-table-row-log-7')).toHaveTextContent('Kunstenaar verwijderd');
    expect(screen.getByTestId('data-table-row-log-8')).toHaveTextContent('Exclusiviteit gewijzigd voor klant');
  });

  it('shows the load error banner when loadError is set', () => {
    renderSection([], 'Kon de activiteiten niet laden. Probeer de pagina te verversen.');
    expect(screen.getByTestId('activiteit-load-error')).toHaveTextContent(
      'Kon de activiteiten niet laden. Probeer de pagina te verversen.'
    );
  });

  it('shows the empty state when there are no activiteiten', () => {
    renderSection([]);
    expect(screen.getByTestId('data-table-empty')).toBeInTheDocument();
  });

  it('finds an activiteit by typing its type label in the search box', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('data-table-search'), {
      target: { value: 'Kunstwerk bekeken' },
    });
    expect(screen.getByTestId('data-table-row-log-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-log-2')).not.toBeInTheDocument();
  });

  it('falls back to the raw type string when no label mapping exists (e.g. a retired event type)', () => {
    renderSection([
      {
        id: 'log-3',
        // @ts-expect-error -- simulating a legacy document with a since-removed type value
        type: 'beheer_bezocht',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-20T08:00:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-3')).toHaveTextContent('beheer_bezocht');
  });

  it('shows the translated label for bestelinstellingen_gewijzigd', () => {
    renderSection([
      {
        id: 'log-5',
        type: 'bestelinstellingen_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T11:00:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-5')).toHaveTextContent('Bestelinstellingen gewijzigd');
  });

  it('shows the translated label for klant_minimale_afname_gewijzigd', () => {
    renderSection([
      {
        id: 'log-6',
        type: 'klant_minimale_afname_gewijzigd',
        actorEmail: 'paul@glassartanddesign.com',
        actorNaam: 'paul@glassartanddesign.com',
        timestamp: new Date('2026-07-26T12:00:00'),
      },
    ]);
    expect(screen.getByTestId('data-table-row-log-6')).toHaveTextContent('Minimale afname gewijzigd voor klant');
  });

  it('shows Dutch labels for the new Stijl and Onderwerp activiteit types', () => {
    renderSection([
      { id: 'log-3', type: 'stijl_toegevoegd', actorEmail: 'paul@glassartanddesign.com', actorNaam: 'Paul', timestamp: null },
      { id: 'log-4', type: 'onderwerp_verwijderd', actorEmail: 'paul@glassartanddesign.com', actorNaam: 'Paul', timestamp: null },
    ]);
    expect(screen.getByTestId('data-table-row-log-3')).toHaveTextContent('Stijl toegevoegd');
    expect(screen.getByTestId('data-table-row-log-4')).toHaveTextContent('Onderwerp verwijderd');
  });
});
