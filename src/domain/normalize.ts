export function normalizeForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
