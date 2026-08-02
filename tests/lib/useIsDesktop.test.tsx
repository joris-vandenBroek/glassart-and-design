import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsDesktop } from '@/lib/useIsDesktop';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsDesktop', () => {
  it('falls back to true when window.matchMedia is unavailable', () => {
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it('returns false when the (min-width: 768px) query does not match', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );

    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it('updates when the media query change event fires', () => {
    let changeHandler: (() => void) | undefined;
    const mediaQueryList = {
      matches: false,
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler;
      },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryList));

    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);

    mediaQueryList.matches = true;
    act(() => {
      changeHandler?.();
    });
    expect(result.current).toBe(true);
  });
});
