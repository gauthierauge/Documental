// Le refus 429 du projet, au format des autres erreurs de l'API : `{ error }`, lu par le client
// de l'écran (src/web/api.ts). La limite de toute l'API, les limites renforcées, celle de Better
// Auth et celles des modules répondent tous ainsi. `Retry-After` dit en secondes quand réessayer ;
// le message le dit en minutes, arrondi à la minute supérieure.

/** « 1 minute », « 15 minutes ». */
export function minutesText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

/** 429 avec `Retry-After` ; `what` nomme ce qui est refusé (« Connexion : trop de tentatives »). */
export function tooManyRequests(waitMs: number, what = 'Trop de requêtes'): Response {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  return Response.json(
    { error: `${what}, réessayez dans ${minutesText(seconds)}.` },
    { status: 429, headers: { 'Retry-After': String(seconds) } },
  );
}
