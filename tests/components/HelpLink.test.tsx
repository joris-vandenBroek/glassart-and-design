import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpLink } from '@/components/HelpLink';

describe('HelpLink', () => {
  it('links to the documentation root when no anchor is given', () => {
    render(<HelpLink label="Open de handleiding" testId="test-help-link" />);
    const link = screen.getByTestId('test-help-link');
    expect(link).toHaveAttribute('href', '/nl/beheer/documentatie');
  });

  it('links to a specific anchor when one is given', () => {
    render(<HelpLink anchor="kunstwerken-code" label="Open het hoofdstuk over de code" testId="test-help-link" />);
    expect(screen.getByTestId('test-help-link')).toHaveAttribute(
      'href',
      '/nl/beheer/documentatie#kunstwerken-code'
    );
  });

  it('opens in a new tab', () => {
    render(<HelpLink label="Open de handleiding" testId="test-help-link" />);
    const link = screen.getByTestId('test-help-link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('uses the label as accessible name and title', () => {
    render(<HelpLink label="Open het hoofdstuk over kunstenaars" testId="test-help-link" />);
    const link = screen.getByTestId('test-help-link');
    expect(link).toHaveAttribute('aria-label', 'Open het hoofdstuk over kunstenaars');
    expect(link).toHaveAttribute('title', 'Open het hoofdstuk over kunstenaars');
  });

  it('falls back to a default test id when none is given', () => {
    render(<HelpLink label="Open de handleiding" />);
    expect(screen.getByTestId('help-link')).toBeInTheDocument();
  });

  it('renders the question mark', () => {
    render(<HelpLink label="Open de handleiding" testId="test-help-link" />);
    expect(screen.getByTestId('test-help-link')).toHaveTextContent('?');
  });
});
