import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSection } from '@/components/FilterSection';

describe('FilterSection', () => {
  it('renders the title and children when open by default', () => {
    render(
      <FilterSection title="Formaat" testId="formaat">
        <p data-testid="formaat-content">inhoud</p>
      </FilterSection>
    );
    expect(screen.getByText('Formaat')).toBeInTheDocument();
    expect(screen.getByTestId('formaat-content')).toBeInTheDocument();
  });

  it('hides children and flips aria-expanded when the header is clicked', () => {
    render(
      <FilterSection title="Formaat" testId="formaat">
        <p data-testid="formaat-content">inhoud</p>
      </FilterSection>
    );
    const toggle = screen.getByTestId('filter-section-formaat-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('formaat-content')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByTestId('formaat-content')).toBeInTheDocument();
  });

  it('starts collapsed when defaultOpen is false', () => {
    render(
      <FilterSection title="Kunstenaar" testId="kunstenaar" defaultOpen={false}>
        <p data-testid="kunstenaar-content">inhoud</p>
      </FilterSection>
    );
    expect(screen.queryByTestId('kunstenaar-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-section-kunstenaar-toggle')).toHaveAttribute('aria-expanded', 'false');
  });
});
