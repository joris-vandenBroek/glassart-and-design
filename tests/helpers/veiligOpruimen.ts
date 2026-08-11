// Wraps one step of a multi-step test `afterEach`/`finally` cleanup so a single failing
// statement (e.g. a column renamed on shared staging by an unmerged worktree, see
// docs/superpowers/plans/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel.md) can't
// abort every cleanup step listed after it in the same hook and leave their fixtures behind.
export async function veiligOpruimen(label: string, opruimen: () => Promise<unknown>): Promise<void> {
  try {
    await opruimen();
  } catch (err) {
    console.warn(`Opruiming van '${label}' is mislukt -- data blijft mogelijk achter op staging:`, err);
  }
}
