import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpHint } from '@/components/HelpHint';

describe('HelpHint', () => {
  it('is closed by default', () => {
    render(<HelpHint text="Dit is de uitleg." testId="test-help" />);
    expect(screen.queryByTestId('test-help-popover')).not.toBeInTheDocument();
  });

  it('shows the help text after clicking the icon, and hides it again on a second click', () => {
    render(<HelpHint text="Dit is de uitleg." testId="test-help" />);

    fireEvent.click(screen.getByTestId('test-help'));
    expect(screen.getByTestId('test-help-popover')).toHaveTextContent('Dit is de uitleg.');

    fireEvent.click(screen.getByTestId('test-help'));
    expect(screen.queryByTestId('test-help-popover')).not.toBeInTheDocument();
  });

  it('closes when Escape is pressed', () => {
    render(<HelpHint text="Dit is de uitleg." testId="test-help" />);
    fireEvent.click(screen.getByTestId('test-help'));
    expect(screen.getByTestId('test-help-popover')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('test-help-popover')).not.toBeInTheDocument();
  });

  it('closes when clicking outside the component', () => {
    render(
      <div>
        <HelpHint text="Dit is de uitleg." testId="test-help" />
        <button type="button" data-testid="outside">
          Buiten
        </button>
      </div>
    );
    fireEvent.click(screen.getByTestId('test-help'));
    expect(screen.getByTestId('test-help-popover')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('test-help-popover')).not.toBeInTheDocument();
  });

  it('falls back to default test ids when none is given', () => {
    render(<HelpHint text="Uitleg." />);
    fireEvent.click(screen.getByTestId('help-hint-button'));
    expect(screen.getByTestId('help-hint-popover')).toHaveTextContent('Uitleg.');
  });
});
