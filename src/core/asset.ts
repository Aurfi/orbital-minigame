export function withBase(path: string): string {
  const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
  const base = meta.env?.BASE_URL ?? '/';
  const b = String(base).replace(/\/+$/, '/');
  const p = String(path).replace(/^\/+/, '');
  return b + p;
}
