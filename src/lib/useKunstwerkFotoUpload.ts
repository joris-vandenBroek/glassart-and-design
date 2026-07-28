'use client';

import { useCallback, useState } from 'react';

export interface UseKunstwerkFotoUploadResult {
  uploading: boolean;
  error: 'upload' | null;
  upload: (file: File) => Promise<string | null>;
}

export function useKunstwerkFotoUpload(): UseKunstwerkFotoUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<'upload' | null>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const endpoint = process.env.NEXT_PUBLIC_UPLOAD_ENDPOINT_URL;
      const secret = process.env.NEXT_PUBLIC_UPLOAD_SECRET;
      if (!endpoint || !secret) {
        setError('upload');
        return null;
      }
      const formData = new FormData();
      formData.append('secret', secret);
      formData.append('foto', file);
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
