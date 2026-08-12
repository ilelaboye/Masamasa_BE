/**
 * Compares two dotted version strings (e.g. "2.0.1" vs "2.1.0").
 * Returns a negative number when `a` is older than `b`, 0 when equal,
 * positive when `a` is newer. Missing segments count as 0, so "2.0" and
 * "2.0.0" compare equal. Non-numeric segments are treated as 0 rather
 * than throwing — a malformed client version must never lock a user out.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? "")
      .trim()
      .split(".")
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isNaN(n) ? 0 : n;
      });

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
