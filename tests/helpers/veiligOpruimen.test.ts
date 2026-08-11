import { describe, expect, it, vi } from 'vitest';
import { veiligOpruimen } from './veiligOpruimen';

describe('veiligOpruimen', () => {
  it('runs the step and resolves when it succeeds', async () => {
    const stap = vi.fn().mockResolvedValue(undefined);
    await expect(veiligOpruimen('klanten', stap)).resolves.toBeUndefined();
    expect(stap).toHaveBeenCalledOnce();
  });

  it('swallows a failing step instead of rejecting, so later cleanup steps can still run', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mislukteStap = vi.fn().mockRejectedValue(new Error("Unknown column 'klantId'"));

    await expect(veiligOpruimen('bestelheaders', mislukteStap)).resolves.toBeUndefined();

    expect(mislukteStap).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Opruiming van 'bestelheaders' is mislukt"),
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it('does not run a later step out of order -- callers still await sequentially', async () => {
    const volgorde: string[] = [];
    await veiligOpruimen('a', async () => {
      volgorde.push('a-start');
      throw new Error('a faalt');
    });
    await veiligOpruimen('b', async () => {
      volgorde.push('b');
    });
    expect(volgorde).toEqual(['a-start', 'b']);
  });
});
