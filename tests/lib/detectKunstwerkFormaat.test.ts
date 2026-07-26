import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  detectFormaatFromDimensions,
  detectFormaatFromImageUrl,
  detectFormaatFromFile,
} from '@/lib/detectKunstwerkFormaat';

describe('detectFormaatFromDimensions', () => {
  it('returns vierkant when width and height are equal', () => {
    expect(detectFormaatFromDimensions(100, 100)).toBe('vierkant');
  });

  it('returns vierkant when the ratio is within 5% of 1:1', () => {
    expect(detectFormaatFromDimensions(104, 100)).toBe('vierkant');
    expect(detectFormaatFromDimensions(100, 104)).toBe('vierkant');
  });

  it('returns liggend when wider than the 5% margin', () => {
    expect(detectFormaatFromDimensions(160, 100)).toBe('liggend');
  });

  it('returns staand when taller than the 5% margin', () => {
    expect(detectFormaatFromDimensions(100, 160)).toBe('staand');
  });
});

class FakeImage {
  static nextDimensions: { width: number; height: number } = { width: 100, height: 100 };
  static shouldError = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  crossOrigin: string | null = null;
  set src(_value: string) {
    queueMicrotask(() => {
      if (FakeImage.shouldError) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = FakeImage.nextDimensions.width;
      this.naturalHeight = FakeImage.nextDimensions.height;
      this.onload?.();
    });
  }
}

describe('detectFormaatFromImageUrl', () => {
  let originalImage: typeof Image;

  beforeEach(() => {
    originalImage = global.Image;
    FakeImage.shouldError = false;
    FakeImage.nextDimensions = { width: 100, height: 100 };
    // @ts-expect-error test double replaces the real Image constructor
    global.Image = FakeImage;
  });

  afterEach(() => {
    global.Image = originalImage;
  });

  it('resolves the detected formaat when the image loads', async () => {
    FakeImage.nextDimensions = { width: 200, height: 100 };
    await expect(detectFormaatFromImageUrl('https://example.com/foto.jpg')).resolves.toBe('liggend');
  });

  it('resolves null when the image fails to load', async () => {
    FakeImage.shouldError = true;
    await expect(detectFormaatFromImageUrl('https://example.com/broken.jpg')).resolves.toBeNull();
  });
});

describe('detectFormaatFromFile', () => {
  let originalImage: typeof Image;
  const createObjectURLMock = vi.fn(() => 'blob:mock-url');
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    originalImage = global.Image;
    FakeImage.shouldError = false;
    FakeImage.nextDimensions = { width: 100, height: 200 };
    // @ts-expect-error test double replaces the real Image constructor
    global.Image = FakeImage;
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock });
  });

  afterEach(() => {
    global.Image = originalImage;
    vi.unstubAllGlobals();
  });

  it('creates and revokes an object URL around the detection call', async () => {
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    const result = await detectFormaatFromFile(file);
    expect(result).toBe('staand');
    expect(createObjectURLMock).toHaveBeenCalledWith(file);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });
});
