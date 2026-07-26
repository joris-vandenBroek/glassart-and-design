import type { KunstwerkFormaat } from '@/components/beheer/materiaalTypes';

export function detectFormaatFromDimensions(width: number, height: number): KunstwerkFormaat {
  const ratio = width / height;
  if (ratio >= 0.95 && ratio <= 1.05) return 'vierkant';
  return ratio > 1.05 ? 'liggend' : 'staand';
}

export function detectFormaatFromImageUrl(url: string): Promise<KunstwerkFormaat | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(detectFormaatFromDimensions(img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve(null);
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

export function detectFormaatFromFile(file: File): Promise<KunstwerkFormaat | null> {
  const objectUrl = URL.createObjectURL(file);
  return detectFormaatFromImageUrl(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));
}
