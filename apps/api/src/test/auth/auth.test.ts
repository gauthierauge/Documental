import {
  cookiesOf,
  createAccount,
  enableTwoFactor,
  ORIGIN,
  post,
  signInAs,
  TEST_PASSWORD,
  totpCode,
} from '@/test/support/auth-helpers';
import { testApp } from '@/test/support/helpers';
import * as schema from '@/db/schema';

type App = Awaited<ReturnType<typeof testApp>>;

const NEW_PASSWORD = 'une phrase factice assez longue';

async function invite(t: App, email: string, role = 'lecteur') {
  await t.deps.db.insert(schema.user).values({ email, name: email.split('@')[0] ?? email, role });
  const asked = await post(t, '/request-password-reset', {
    email,
    redirectTo: '/mot-de-passe/nouveau',
  });
  expect(asked.status).toBe(200);
}

/** Suit le lien reçu par e-mail jusqu'à l'écran de choix du mot de passe : renvoie le jeton. */
async function tokenFromMail(t: App, email: string): Promise<string> {
  const link = new URL(t.deps.mailer.lastLink(email) ?? '');
  const opened = await t.app.request(link.pathname + link.search, { headers: { origin: ORIGIN } });
  expect(opened.status).toBe(302);
  const target = new URL(opened.headers.get('location') ?? '', ORIGIN);
  expect(target.pathname).toBe('/mot-de-passe/nouveau');
  return target.searchParams.get('token') ?? '';
}

function me(t: App, cookie: string) {
  return t.app.request('/api/me', { headers: { cookie } });
}

describe('Connexion par mot de passe', () => {
  it('refuse /api/me sans session', async () => {
    const t = await testApp();
    expect((await t.app.request('/api/me')).status).toBe(401);
  });

  it('invitation, choix du mot de passe, puis connexion', async () => {
    const t = await testApp();
    await invite(t, 'claire@exemple.fr', 'editeur');
    const mail = t.deps.mailer.sent.at(-1);
    expect(mail?.subject).toContain('Votre accès');
    expect(mail?.text).toContain('72 heures');
    // Le lien d'invitation dure bien 72 heures, pas l'heure d'un lien de réinitialisation.
    const links = await t.deps.db
      .select({ expiresAt: schema.verification.expiresAt })
      .from(schema.verification);
    expect(links[0]?.expiresAt.getTime() ?? 0).toBeGreaterThan(Date.now() + 71 * 3600 * 1000);

    const token = await tokenFromMail(t, 'claire@exemple.fr');
    expect((await post(t, '/reset-password', { token, newPassword: NEW_PASSWORD })).status).toBe(
      200,
    );
    // Le lien ne sert qu'une fois.
    expect((await post(t, '/reset-password', { token, newPassword: NEW_PASSWORD })).status).toBe(
      400,
    );

    const signedIn = await post(t, '/sign-in/email', {
      email: 'claire@exemple.fr',
      password: NEW_PASSWORD,
    });
    expect(signedIn.status).toBe(200);
    const response = await me(t, cookiesOf(signedIn));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { email: 'claire@exemple.fr', role: 'editeur' },
    });
  });

  it('refuse un mot de passe trop court ou trop courant, sans consommer le lien', async () => {
    const t = await testApp();
    await invite(t, 'court@exemple.fr');
    const token = await tokenFromMail(t, 'court@exemple.fr');
    for (const newPassword of ['court', 'Motdepasse2026!', 'azertyuiop123', '123456789012']) {
      const refused = await post(t, '/reset-password', { token, newPassword });
      expect(refused.status, newPassword).toBe(400);
      expect(await refused.json()).toMatchObject({ code: 'MOT_DE_PASSE_REFUSE' });
    }
    expect((await post(t, '/reset-password', { token, newPassword: NEW_PASSWORD })).status).toBe(
      200,
    );
  });

  it('répond pareil pour un mauvais mot de passe et une adresse inconnue', async () => {
    const t = await testApp();
    await createAccount(t, 'lecteur', 'connu@exemple.fr');
    const wrong = await post(t, '/sign-in/email', {
      email: 'connu@exemple.fr',
      password: 'pas le bon mot de passe',
    });
    const unknown = await post(t, '/sign-in/email', {
      email: 'inconnu@exemple.fr',
      password: 'pas le bon mot de passe',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it('limite les tentatives de connexion', async () => {
    const t = await testApp();
    await createAccount(t, 'lecteur', 'cible@exemple.fr');
    for (let i = 0; i < 5; i += 1) {
      expect(
        (
          await post(t, '/sign-in/email', {
            email: 'cible@exemple.fr',
            password: `essai factice ${i}`,
          })
        ).status,
      ).toBe(401);
    }
    // Même le bon mot de passe attend la fin de la fenêtre.
    const blocked = await post(t, '/sign-in/email', {
      email: 'cible@exemple.fr',
      password: TEST_PASSWORD,
    });
    expect(blocked.status).toBe(429);
    // Le refus de Better Auth, au format du projet, avec son délai.
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await blocked.text()).toMatch(
      /Connexion : trop de tentatives, réessayez dans \d+ minutes?\./,
    );
  });

  it("n'envoie rien à une adresse sans compte, sans le dire", async () => {
    const t = await testApp();
    const asked = await post(t, '/request-password-reset', {
      email: 'personne@exemple.fr',
      redirectTo: '/mot-de-passe/nouveau',
    });
    expect(asked.status).toBe(200);
    expect(t.deps.mailer.lastLink('personne@exemple.fr')).toBeNull();
  });

  it('réinitialise un mot de passe oublié et ferme les sessions ouvertes', async () => {
    const t = await testApp();
    const cookie = await signInAs(t, 'editeur', { email: 'oubli@exemple.fr' });
    await post(t, '/request-password-reset', {
      email: 'oubli@exemple.fr',
      redirectTo: '/mot-de-passe/nouveau',
    });
    expect(t.deps.mailer.sent.at(-1)?.subject).toBe('Réinitialiser votre mot de passe');
    const token = await tokenFromMail(t, 'oubli@exemple.fr');
    expect((await post(t, '/reset-password', { token, newPassword: NEW_PASSWORD })).status).toBe(
      200,
    );
    expect((await me(t, cookie)).status).toBe(401);
    expect(
      (await post(t, '/sign-in/email', { email: 'oubli@exemple.fr', password: NEW_PASSWORD }))
        .status,
    ).toBe(200);
  });

  it('ne permet pas de créer un compte soi-même', async () => {
    const t = await testApp();
    const response = await post(t, '/sign-up/email', {
      email: 'intrus@exemple.fr',
      password: NEW_PASSWORD,
      name: 'x',
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe('Double authentification', () => {
  it('une fois activée, la connexion demande le code TOTP', async () => {
    const t = await testApp();
    const first = await signInAs(t, 'editeur', { email: 'totp@exemple.fr' });
    const { totpURI, backupCodes } = await enableTwoFactor(t, first);
    expect(totpURI).toMatch(/^otpauth:\/\/totp\//);
    expect(backupCodes).toHaveLength(10);

    const signedIn = await post(t, '/sign-in/email', {
      email: 'totp@exemple.fr',
      password: TEST_PASSWORD,
    });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({ twoFactorRedirect: true });
    const pending = cookiesOf(signedIn);
    // Le mot de passe seul n'ouvre pas de session.
    expect((await me(t, pending)).status).toBe(401);

    expect((await post(t, '/two-factor/verify-totp', { code: '000000' }, pending)).status).toBe(
      401,
    );
    const verified = await post(t, '/two-factor/verify-totp', { code: totpCode(totpURI) }, pending);
    expect(verified.status).toBe(200);
    expect((await me(t, cookiesOf(verified, pending))).status).toBe(200);
  });

  it('un code de secours remplace le code TOTP, une seule fois', async () => {
    const t = await testApp();
    const first = await signInAs(t, 'lecteur', { email: 'secours@exemple.fr' });
    const { backupCodes } = await enableTwoFactor(t, first);
    const code = backupCodes[0] ?? '';

    const once = cookiesOf(
      await post(t, '/sign-in/email', { email: 'secours@exemple.fr', password: TEST_PASSWORD }),
    );
    expect((await post(t, '/two-factor/verify-backup-code', { code }, once)).status).toBe(200);
    const twice = cookiesOf(
      await post(t, '/sign-in/email', { email: 'secours@exemple.fr', password: TEST_PASSWORD }),
    );
    expect((await post(t, '/two-factor/verify-backup-code', { code }, twice)).status).toBe(401);
  });

  it('un admin ne peut pas désactiver sa double authentification', async () => {
    const t = await testApp();
    const cookie = await signInAs(t, 'admin', { strong: true });
    const response = await post(t, '/two-factor/disable', { password: TEST_PASSWORD }, cookie);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'DEUXFA_OBLIGATOIRE' });
  });
});

// Better Auth compte les tentatives par adresse IP : celle que le serveur a résolue selon
// TRUST_PROXY, jamais un en-tête choisi par le client. Une adresse e-mail par adresse IP : seul
// le compteur par adresse IP est en jeu.

function signIn(t: App, forwardedFor: string) {
  return t.app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:5173',
      'content-type': 'application/json',
      'x-forwarded-for': forwardedFor,
    },
    body: JSON.stringify({
      email: `personne-${forwardedFor}@exemple.fr`,
      password: 'pas le bon mot de passe',
    }),
  });
}

async function attempts(t: App, ips: string[]): Promise<number[]> {
  const statuses: number[] = [];
  for (const ip of ips) statuses.push((await signIn(t, ip)).status);
  return statuses;
}

describe('Connexion : adresse IP des tentatives', () => {
  it('sans proxy de confiance, changer X-Forwarded-For ne contourne pas la limite', async () => {
    const t = await testApp();
    const ips = [
      '203.0.113.1',
      '203.0.113.2',
      '203.0.113.3',
      '203.0.113.4',
      '203.0.113.5',
      '203.0.113.6',
    ];
    expect((await attempts(t, ips)).at(-1)).toBe(429);
  });

  it('derrière un proxy déclaré, chaque visiteur a son propre compteur', async () => {
    const t = await testApp({ env: { TRUST_PROXY: 'x-forwarded-for' } });
    const same = Array.from({ length: 6 }, () => '203.0.113.10');
    expect((await attempts(t, same)).at(-1)).toBe(429);
    expect(await attempts(t, ['203.0.113.11'])).toEqual([401]);
  });
});
