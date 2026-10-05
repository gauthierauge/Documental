import { testApp } from '@/test/support/helpers';
import { readEnv } from '@/env';
import { securityTxt } from '@/http/security-txt';

describe('security.txt', () => {
  it('donne le contact et une date d’expiration à moins d’un an (RFC 9116)', () => {
    const text = securityTxt('mailto:securite@exemple.fr', new Date('2026-01-01T00:00:00Z'));
    expect(text).toContain('Contact: mailto:securite@exemple.fr\n');
    expect(text).toContain('Expires: 2026-06-30T00:00:00Z\n');
  });

  it('est servi quand SECURITY_CONTACT est réglé, en texte', async () => {
    const { app } = await testApp({ env: { SECURITY_CONTACT: 'securite@exemple.fr' } });
    const response = await app.request('/.well-known/security.txt');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    const text = await response.text();
    expect(text).toContain('Contact: mailto:securite@exemple.fr');
    const expires = new Date(/Expires: (.+)/.exec(text)?.[1] ?? '');
    expect(expires.getTime()).toBeGreaterThan(Date.now());
    expect(expires.getTime() - Date.now()).toBeLessThan(365 * 24 * 3600 * 1000);
  });

  it('n’existe pas sans contact', async () => {
    const { app } = await testApp();
    expect((await app.request('/.well-known/security.txt')).status).toBe(404);
  });

  it('refuse un contact qui n’est ni un e-mail ni une adresse https', () => {
    expect(() => readEnv({ SECURITY_CONTACT: 'http://exemple.fr/securite' })).toThrow(
      'SECURITY_CONTACT',
    );
    expect(readEnv({ SECURITY_CONTACT: 'https://exemple.fr/securite' }).SECURITY_CONTACT).toBe(
      'https://exemple.fr/securite',
    );
  });
});
