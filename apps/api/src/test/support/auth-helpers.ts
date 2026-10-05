import { createHmac } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import * as schema from '@/db/schema';
import type { testApp } from './helpers';

// Se connecter dans un test, quelle que soit la méthode de connexion du projet : les tests du
// panel admin et des autres modules passent par ici.

type App = Awaited<ReturnType<typeof testApp>>;
type Role = 'admin' | 'editeur' | 'lecteur';

export const ORIGIN = 'http://localhost:5173';
/** Manifestement factice : jamais un vrai mot de passe dans le dépôt, même pour un test. */
export const TEST_PASSWORD = 'phrase-factice-pour-les-tests';
let counter = 0;
// scrypt est lent à dessein : une empreinte calculée une fois suffit pour tous les comptes de test.
let testHash: Promise<string> | null = null;

/** Ce que contient le lien envoyé à un compte invité. */
export const INVITATION_LINK: string | null = '/reset-password/';

/** Les cookies posés par une réponse, prêts à renvoyer (`nom=valeur; nom=valeur`). */
export function cookiesOf(response: Response, previous = ''): string {
  const jar = new Map(
    previous
      .split('; ')
      .filter(Boolean)
      .map((c) => [c.split('=')[0] ?? '', c] as const),
  );
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';')[0] ?? '';
    const [name = '', value = ''] = pair.split('=');
    if (value) jar.set(name, pair);
    else jar.delete(name);
  }
  return [...jar.values()].join('; ');
}

export function post(t: App, path: string, body: unknown, cookie = ''): Promise<Response> {
  return Promise.resolve(
    t.app.request(`/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

function base32(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Le code à six chiffres qu'afficherait l'application d'authentification (RFC 6238). */
export function totpCode(totpURI: string, at = Date.now()): string {
  const secret = new URL(totpURI).searchParams.get('secret') ?? '';
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', base32(secret)).update(counterBytes).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Un compte invité qui a déjà choisi son mot de passe. */
export async function createAccount(t: App, role: Role, email: string): Promise<string> {
  const [created] = await t.deps.db
    .insert(schema.user)
    .values({ email, name: role, role })
    .returning({ id: schema.user.id });
  const userId = created?.id ?? '';
  testHash ??= hashPassword(TEST_PASSWORD);
  await t.deps.db.insert(schema.account).values({
    userId,
    accountId: userId,
    providerId: 'credential',
    password: await testHash,
  });
  return userId;
}

/** Active la double authentification d'un compte connecté ; renvoie le nouveau cookie et l'URI TOTP. */
export async function enableTwoFactor(
  t: App,
  cookie: string,
): Promise<{ cookie: string; totpURI: string; backupCodes: string[] }> {
  const enabled = await post(t, '/two-factor/enable', { password: TEST_PASSWORD }, cookie);
  const { totpURI, backupCodes } = (await enabled.json()) as {
    totpURI: string;
    backupCodes: string[];
  };
  const verified = await post(t, '/two-factor/verify-totp', { code: totpCode(totpURI) }, cookie);
  if (verified.status !== 200)
    throw new Error(`Activation de la double authentification : ${verified.status}`);
  return { cookie: cookiesOf(verified, cookie), totpURI, backupCodes };
}

/**
 * Crée un compte du rôle donné et renvoie son cookie de session. `strong` : le compte a aussi
 * activé la double authentification, le facteur fort exigé des admins.
 */
export async function signInAs(
  t: App,
  role: Role,
  options: { strong?: boolean; email?: string } = {},
): Promise<string> {
  counter += 1;
  const email = options.email ?? `${role}-${counter}@exemple.fr`;
  await createAccount(t, role, email);
  const signedIn = await post(t, '/sign-in/email', { email, password: TEST_PASSWORD });
  if (signedIn.status !== 200) throw new Error(`Connexion de test refusée : ${signedIn.status}`);
  const cookie = cookiesOf(signedIn);
  return options.strong ? (await enableTwoFactor(t, cookie)).cookie : cookie;
}

/** Le dernier lien envoyé à cette adresse (invitation ou accès), null si rien n'est parti. */
export function lastInvitationLink(t: App, email: string): string | null {
  return t.deps.mailer.lastLink(email);
}
