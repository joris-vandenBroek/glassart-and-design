import { describe, expect, it } from 'vitest';
import { computeTargetDimensions } from '@/lib/compressImage';

describe('computeTargetDimensions', () => {
  it('leaves dimensions unchanged when the longest side is already within the limit', () => {
    expect(computeTargetDimensions(1200, 800, 2000)).toEqual({ width: 1200, height: 800 });
  });

  it('leaves dimensions unchanged when the longest side exactly equals the limit', () => {
    expect(computeTargetDimensions(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  it('scales down a landscape image, preserving aspect ratio', () => {
    expect(computeTargetDimensions(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  it('scales down a portrait image, preserving aspect ratio', () => {
    expect(computeTargetDimensions(2000, 4000, 2000)).toEqual({ width: 1000, height: 2000 });
  });

  it('scales down a square image', () => {
    expect(computeTargetDimensions(3000, 3000, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it('never upscales a smaller image', () => {
    expect(computeTargetDimensions(400, 300, 2000)).toEqual({ width: 400, height: 300 });
  });

  it('defaults maxDimension to 2000 when not passed', () => {
    expect(computeTargetDimensions(4000, 1000)).toEqual({ width: 2000, height: 500 });
  });
});
