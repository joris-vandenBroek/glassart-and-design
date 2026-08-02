'use client';

import { useCallback, useState } from 'react';
import { compressImage } from '@/lib/compressImage';

// Mirrors MAX_FOTO_BYTES in upload-server/upload-kunstwerk-foto.php -- keep both in sync.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface UseKunstwerkFotoUploadResult {
  uploading: boolean;
  error: 'upload' | 'too-large' | null;
  upload: (file: File) => Promise<string | null>;
}

export function useKunstwerkFotoUpload(): UseKunstwerkFotoUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<'upload' | 'too-large' | null>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const finalFile = await compressImage(file);
      if (finalFile.size > MAX_UPLOAD_BYTES) {
        setError('too-large');
        return null;
      }
      const endpoint = process.env.NEXT_PUBLIC_UPLOAD_ENDPOINT_URL;
      const secret = process.env.NEXT_PUBLIC_UPLOAD_SECRET;
      if (!endpoint || !secret) {
        setError('upload');
        return null;
      }
      const formData = new FormData();
      formData.append('secret', secret);
      formData.append('foto', finalFile);
      const response = await fetch(endpoint, { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError('upload');
        return null;
      }
      return data.url as string;
    } catch {
      setError('upload');
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, error, upload };
}
