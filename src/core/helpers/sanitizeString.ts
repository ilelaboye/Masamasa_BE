export function sanitizeString(str: string) {
  return str.replace(/\s+/g, '').toLowerCase();
}
