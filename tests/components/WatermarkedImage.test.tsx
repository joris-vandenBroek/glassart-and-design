import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WatermarkedImage } from '@/components/WatermarkedImage';

describe('WatermarkedImage', () => {
  it('renders the image with the given src and alt text (no canvas support: falls back to <img>)', () => {
    render(<WatermarkedImage src="https://example.com/foto.jpg" alt="Een kunstwerk" />);
    const img = screen.getByRole('img', { name: 'Een kunstwerk' });
    expect(img).toHaveAttribute('src', 'https://example.com/foto.jpg');
  });

  it('renders a non-interactive watermark overlay with the copyright text as a fallback', () => {
    render(<WatermarkedImage src="https://example.com/foto.jpg" alt="Een kunstwerk" />);
    const overlay = screen.getByTestId('watermark-overlay');
    expect(overlay).toHaveTextContent('© Glassart & Design');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies an extra className to the wrapper when given', () => {
    render(<WatermarkedImage src="https://example.com/foto.jpg" alt="Een kunstwerk" className="h-12 w-12" />);
    expect(screen.getByTestId('watermarked-image')).toHaveClass('h-12', 'w-12');
  });

  describe('when canvas rendering succeeds', () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalImage = window.Image;

    afterEach(() => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      window.Image = originalImage;
    });

    function mockCanvasAndImage() {
      const fakeCtx = {
        fillStyle: '' as string,
        setTransform: vi.fn(),
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        fillText: vi.fn(),
      };
      // @ts-expect-error partial mock is enough for the drawing calls this component makes
      HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx);

      class FakeImage {
        naturalWidth = 800;
        naturalHeight = 600;
        complete = true;
        crossOrigin: string | null = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          setTimeout(() => this.onload?.());
        }
      }
      // @ts-expect-error test double for the browser Image constructor
      window.Image = FakeImage;

      return fakeCtx;
    }

    it('bakes the watermark into the canvas instead of showing a bypassable <img> overlay', async () => {
      mockCanvasAndImage();
      render(<WatermarkedImage src="https://example.com/foto.jpg" alt="Een kunstwerk" />);

      await waitFor(() => {
        expect(screen.getByTestId('watermark-canvas')).toHaveAttribute('role', 'img');
      });

      expect(screen.queryByTestId('watermark-overlay')).not.toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Een kunstwerk' })?.tagName).toBe('CANVAS');
    });

    it('fills the contain-mode letterbox with white by default, or ink when fitBackground="ink" is set', async () => {
      const fakeCtx = mockCanvasAndImage();
      let fillStyleAtFillRect: string | undefined;
      fakeCtx.fillRect = vi.fn(() => {
        fillStyleAtFillRect = fakeCtx.fillStyle as string;
      });

      const { rerender } = render(
        <WatermarkedImage src="https://example.com/foto.jpg" alt="Een kunstwerk" fit="contain" />
      );
      await waitFor(() => expect(fakeCtx.fillRect).toHaveBeenCalled());
      expect(fillStyleAtFillRect).toBe('#ffffff');

      fillStyleAtFillRect = undefined;
      rerender(
        <WatermarkedImage src="https://example.com/foto.jpg" alt="Een kunstwerk" fit="contain" fitBackground="ink" />
      );
      await waitFor(() => expect(fillStyleAtFillRect).toBe('#060607'));
    });
  });
});
