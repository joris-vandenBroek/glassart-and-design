import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import { compressImage } from '@/lib/compressImage';

vi.mock('@/lib/compressImage', () => ({
  compressImage: vi.fn(),
}));

const compressImageMock = vi.mocked(compressImage);

function TestConsumer() {
  const { uploading, error, upload } = useKunstwerkFotoUpload();
  const [url, setUrl] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      const result = await upload(file);
      setUrl(result);
    }
  }

  return (
    <div>
      <input type="file" data-testid="file-input" onChange={handleChange} />
      <div data-testid="uploading">{String(uploading)}</div>
      <div data-testid="error">{error ?? 'none'}</div>
      <div data-testid="url">{url ?? 'none'}</div>
    </div>
  );
}

function makeFile(name = 'foto.jpg') {
  return new File(['inhoud'], name, { type: 'image/jpeg' });
}

// De hook praat niet meer rechtstreeks met de PHP-uploader: die aanroep loopt via
// /api/upload, zodat het gedeelde secret server-side blijft. Endpoint en secret
// zijn daarmee servergevallen -- zie tests/app/api/upload.test.ts.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  compressImageMock.mockReset();
  compressImageMock.mockImplementation(async (file: File) => file);
});

describe('useKunstwerkFotoUpload', () => {
  it('uploads the file and resolves with the download URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: 'https://storage.example.com/foto.jpg' }),
    });
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('https://storage.example.com/foto.jpg'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  it('sends the file as form data to /api/upload, without a shared secret', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: 'https://storage.example.com/foto.jpg' }),
    });
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile('mijn-kunstwerk.png')] } });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [endpoint, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(endpoint).toBe('/api/upload');
    expect(options.method).toBe('POST');
    const body = options.body as FormData;
    expect(body.get('secret')).toBeNull();
    expect((body.get('foto') as File).name).toBe('mijn-kunstwerk.png');
  });

  it('sets uploading to true while the upload is in flight, then false when done', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('uploading')).toHaveTextContent('true'));
    resolveFetch({ ok: true, json: async () => ({ success: true, url: 'https://storage.example.com/foto.jpg' }) });
    await waitFor(() => expect(screen.getByTestId('uploading')).toHaveTextContent('false'));
  });

  it('sets an error and resolves null when the endpoint responds with an error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'Forbidden' }),
    });
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('upload'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
    expect(screen.getByTestId('uploading')).toHaveTextContent('false');
  });

  it('sets an error and resolves null when fetch throws', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('upload'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
  });

  it('sets an error when the upload route responds without a URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'upload-mislukt' }),
    });
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('upload'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
  });

  it('sets error to too-large and does not call fetch when the compressed file still exceeds 8MB', async () => {
    const oversized = new File([new Uint8Array(9 * 1024 * 1024)], 'foto.jpg', { type: 'image/jpeg' });
    compressImageMock.mockResolvedValue(oversized);
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('too-large'));
    expect(screen.getByTestId('url')).toHaveTextContent('none');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uploads the compressed file returned by compressImage, not the original', async () => {
    const compressed = new File(['klein'], 'foto.jpg', { type: 'image/jpeg' });
    compressImageMock.mockResolvedValue(compressed);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: 'https://storage.example.com/foto.jpg' }),
    });
    render(<TestConsumer />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [makeFile('groot-origineel.jpg')] } });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = options.body as FormData;
    expect((body.get('foto') as File).name).toBe('foto.jpg');
    expect(compressImageMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'groot-origineel.jpg' }));
  });
});
