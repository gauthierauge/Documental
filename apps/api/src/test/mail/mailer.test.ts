import { createMailer, MemoryMailer } from '@/mail/mailer';

const MAIL = {
  to: 'client@atelier.test',
  subject: 'Bonjour',
  text: 'Votre lien : https://atelier.test/l/1',
};
const FROM = 'Atelier <bonjour@atelier.test>';

function fakeService(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
  return {
    calls,
    sent: () => JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>,
    headers: () => calls[0]?.init.headers as Record<string, string>,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('en mémoire, pour les tests', () => {
  test('garde chaque e-mail et retrouve le dernier lien envoyé à une adresse', async () => {
    const mailer = new MemoryMailer();
    expect(await mailer.send(MAIL)).toEqual({ id: 'memoire-1' });
    expect(mailer.sent).toEqual([MAIL]);
    expect(mailer.lastLink(MAIL.to)).toBe('https://atelier.test/l/1');
    expect(mailer.lastLink('autre@atelier.test')).toBeNull();
  });
});

describe('dans le terminal, en développement', () => {
  test('affiche l’e-mail, sans rien envoyer', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const mailer = createMailer({ MAIL_PROVIDER: 'console', MAIL_FROM: FROM });
    expect(await mailer.send({ ...MAIL, replyTo: 'visiteur@atelier.test' })).toEqual({ id: null });
    expect(info.mock.calls[0]?.[0]).toContain('Répondre à : visiteur@atelier.test');
  });
});

describe('par l’API d’un service managé', () => {
  test('sans clé, refuse de démarrer', () => {
    expect(() => createMailer({ MAIL_PROVIDER: 'brevo', MAIL_FROM: FROM })).toThrow(/MAIL_API_KEY/);
  });

  test('Brevo : expéditeur lu dans MAIL_FROM, clé dans son en-tête, identifiant du message rendu', async () => {
    const service = fakeService(201, { messageId: '<message-1@brevo>' });
    const mailer = createMailer({
      MAIL_PROVIDER: 'brevo',
      MAIL_API_KEY: 'cle-essai',
      MAIL_FROM: FROM,
    });
    expect(await mailer.send({ ...MAIL, replyTo: 'visiteur@atelier.test' })).toEqual({
      id: '<message-1@brevo>',
    });
    expect(service.calls[0]?.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(service.headers()['api-key']).toBe('cle-essai');
    expect(service.sent()).toEqual({
      sender: { name: 'Atelier', email: 'bonjour@atelier.test' },
      to: [{ email: MAIL.to }],
      subject: MAIL.subject,
      textContent: MAIL.text,
      replyTo: { email: 'visiteur@atelier.test' },
    });
  });

  test('Resend : clé en Bearer, expéditeur tel quel ; une réponse sans identifiant rend null', async () => {
    const service = fakeService(200, {});
    const mailer = createMailer({
      MAIL_PROVIDER: 'resend',
      MAIL_API_KEY: 'cle-essai',
      MAIL_FROM: 'bonjour@atelier.test',
    });
    expect(await mailer.send(MAIL)).toEqual({ id: null });
    expect(service.calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(service.headers().authorization).toBe('Bearer cle-essai');
    expect(service.sent()).toEqual({
      from: 'bonjour@atelier.test',
      to: [MAIL.to],
      subject: MAIL.subject,
      text: MAIL.text,
    });
  });

  test('un envoi refusé lève une erreur avec le statut seul, jamais le corps de la réponse', async () => {
    fakeService(422, { message: `adresse refusée : ${MAIL.to}` });
    const mailer = createMailer({
      MAIL_PROVIDER: 'resend',
      MAIL_API_KEY: 'cle-essai',
      MAIL_FROM: FROM,
    });
    const error = await mailer.send(MAIL).catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Envoi d'e-mail refusé par resend (422)");
  });
});
