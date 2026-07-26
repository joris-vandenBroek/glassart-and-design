import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KunstwerkSpecCard } from '@/components/KunstwerkSpecCard';
import messages from '../../messages/nl.json';
import type { ComponentProps } from 'react';

function renderCard(overrides: Partial<ComponentProps<typeof KunstwerkSpecCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KunstwerkSpecCard
        code="GLS-SAB-009"
        titel="Vibrant Spirit"
        artiest="Sabrina"
        collectieLabels={['Hotel']}
        materiaalLabel="4mm Veiligheidsglas"
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}

describe('KunstwerkSpecCard', () => {
  it('renders the code, title, artiest and collectie', () => {
    renderCard();
    expect(screen.getByTestId('kunstwerk-spec-card-code')).toHaveTextContent('GLS-SAB-009');
    expect(screen.getByTestId('kunstwerk-spec-card-titel')).toHaveTextContent('Vibrant Spirit');
    expect(screen.getByTestId('kunstwerk-spec-card-artiest')).toHaveTextContent('Sabrina');
    expect(screen.getByTestId('kunstwerk-spec-card-collectie')).toHaveTextContent('Hotel');
  });

  it('shows the given materiaal label', () => {
    renderCard({ materiaalLabel: '4mm Veiligheidsglas' });
    expect(screen.getByTestId('kunstwerk-spec-card-materiaal')).toHaveTextContent('4mm Veiligheidsglas');
  });

  it('hides the materiaal row when the label is empty', () => {
    renderCard({ materiaalLabel: '' });
    expect(screen.queryByTestId('kunstwerk-spec-card-materiaal')).not.toBeInTheDocument();
  });

  it('never renders a Formaten row', () => {
    renderCard();
    expect(screen.queryByTestId('kunstwerk-spec-card-formaten')).not.toBeInTheDocument();
  });
});
