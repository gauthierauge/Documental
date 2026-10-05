import type { Handler } from 'hono';

// /.well-known/security.txt (RFC 9116) : où signaler une faille. Le champ Expires est
// obligatoire et doit rester à moins d'un an : il est recalculé à chaque appel, tant que le
// contact est configuré (SECURITY_CONTACT).

const VALIDITY_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

export function securityTxt(contact: string, now: Date): string {
  const expires = new Date(now.getTime() + VALIDITY_DAYS * DAY_MS);
  return [
    `Contact: ${contact}`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    'Preferred-Languages: fr, en',
    '',
  ].join('\n');
}

export function securityTxtHandler(contact: string, clock: () => Date = () => new Date()): Handler {
  return (c) =>
    c.text(securityTxt(contact, clock()), 200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    });
}
