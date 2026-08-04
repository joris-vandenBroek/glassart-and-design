import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { HelpHint } from '@/components/HelpHint';
import { Modal } from '@/components/Modal';
import messages from '../../messages/nl.json';

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

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
    const button = screen.getByTestId('test-help');
    fireEvent.click(button);
    expect(screen.getByTestId('test-help-popover')).toBeInTheDocument();

    // The button retains focus after being clicked, so a real Escape
    // keypress targets the button and bubbles up through the container —
    // dispatch it there rather than on `document` to match that.
    fireEvent.keyDown(button, { key: 'Escape' });
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

  it('does not close a parent Modal when Escape is pressed while the popover is open', () => {
    const onCloseMock = vi.fn();
    renderWithIntl(
      <Modal isOpen={true} onClose={onCloseMock} closeLabel="Sluiten" title="Test modal">
        <HelpHint text="Uitleg." testId="test-help" />
      </Modal>
    );

    const button = screen.getByTestId('test-help');
    fireEvent.click(button);
    expect(screen.getByTestId('test-help-popover')).toBeInTheDocument();

    // Same reasoning as the standalone "closes when Escape is pressed" test:
    // the button has focus, so the real keypress targets it and bubbles up
    // through HelpHint's container before it would otherwise reach the
    // Modal's own document-level Escape listener.
    fireEvent.keyDown(button, { key: 'Escape' });

    expect(screen.queryByTestId('test-help-popover')).not.toBeInTheDocument();
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it('falls back to default test ids when none is given', () => {
    render(<HelpHint text="Uitleg." />);
    fireEvent.click(screen.getByTestId('help-hint-button'));
    expect(screen.getByTestId('help-hint-popover')).toHaveTextContent('Uitleg.');
  });

  describe('placement (avoiding viewport edges)', () => {
    const originalInnerWidth = window.innerWidth;

    function mockRects(containerRect: Partial<DOMRect>, popoverWidth: number) {
      const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
      rectSpy
        .mockImplementationOnce(
          () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {}, ...containerRect }) as DOMRect
        )
        .mockImplementationOnce(
          () => ({ left: 0, top: 0, right: 0, bottom: 0, width: popoverWidth, height: 0, x: 0, y: 0, toJSON() {} }) as DOMRect
        );
      return rectSpy;
    }

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
      vi.restoreAllMocks();
    });

    it('opens leftward (right-0) when centering would overflow the right edge', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
      mockRects({ left: 990, width: 20 }, 256);

      render(<HelpHint text="Uitleg." testId="test-help" />);
      fireEvent.click(screen.getByTestId('test-help'));

      expect(screen.getByTestId('test-help-popover')).toHaveClass('right-0');
    });

    it('opens rightward (left-0) when centering would overflow the left edge', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
      mockRects({ left: 4, width: 20 }, 256);

      render(<HelpHint text="Uitleg." testId="test-help" />);
      fireEvent.click(screen.getByTestId('test-help'));

      expect(screen.getByTestId('test-help-popover')).toHaveClass('left-0');
    });

    it('stays centered when there is room on both sides', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
      mockRects({ left: 500, width: 20 }, 256);

      render(<HelpHint text="Uitleg." testId="test-help" />);
      fireEvent.click(screen.getByTestId('test-help'));

      expect(screen.getByTestId('test-help-popover')).toHaveClass('left-1/2');
      expect(screen.getByTestId('test-help-popover')).toHaveClass('-translate-x-1/2');
    });
  });
});
