// Le message d'un refus 429 de l'API, lu au format du projet : `{ error }`, qui dit déjà quand
// réessayer. Sans message lisible, l'en-tête `Retry-After` (en secondes) suffit à le dire.

/** « 1 minute », « 15 minutes ». */
function minutesText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

export function tooManyMessage(body: unknown, retryAfter: string | null): string {
  const message = (body as { error?: unknown } | null)?.error;
  if (typeof message === 'string' && message) return message;
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0
    ? `Trop de requêtes, réessayez dans ${minutesText(seconds)}.`
    : 'Trop de requêtes, réessayez dans quelques minutes.';
}
