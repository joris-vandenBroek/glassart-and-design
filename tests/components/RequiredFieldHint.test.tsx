import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';

describe('RequiredFieldHint', () => {
  it('renders an asterisk next to arbitrary label text', () => {
    render(
      <label data-testid="test-label">
        Veldnaam
        <RequiredMark />
      </label>
    );
    expect(screen.getByTestId('test-label')).toHaveTextContent('Veldnaam *');
  });

  it('renders the legend text under the given testId', () => {
    render(<RequiredLegend testId="test-verplicht-legende">* verplicht veld</RequiredLegend>);
    expect(screen.getByTestId('test-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
