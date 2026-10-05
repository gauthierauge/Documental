export function minutesText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

export function tooManyRequests(waitMs: number, what = 'Trop de requêtes'): Response {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  return Response.json(
    { error: `${what}, réessayez dans ${minutesText(seconds)}.` },
    { status: 429, headers: { 'Retry-After': String(seconds) } },
  );
}
