const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.8;

export function computeTargetDimensions(
  width: number,
  height: number,
  maxDimension: number = MAX_DIMENSION
): { width: number; height: number } {
  const longestSide = Math.max(width, height);
  if (longestSide <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / longestSide;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function withJpgExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return `${base}.jpg`;
}

export function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    function fallbackToOriginal() {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    }

    img.onerror = fallbackToOriginal;

    img.onload = () => {
      try {
        const { width, height } = computeTargetDimensions(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fallbackToOriginal();
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              resolve(file);
              return;
            }
            resolve(new File([blob], withJpgExtension(file.name), { type: 'image/jpeg' }));
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      } catch {
        fallbackToOriginal();
      }
    };

    img.src = objectUrl;
  });
}
