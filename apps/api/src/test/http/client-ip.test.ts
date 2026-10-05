import { testApp } from '@/test/support/helpers';
import { resolveClientIp, UNKNOWN_IP } from '@/http/client-ip';

const SOCKET = '10.0.0.2';

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe('adresse IP du visiteur', () => {
  it('sans proxy de confiance, ignore les en-têtes envoyés par le client', () => {
    const forged = headers({ 'x-forwarded-for': '203.0.113.9', 'cf-connecting-ip': '203.0.113.8' });
    expect(resolveClientIp(forged, SOCKET, { trust: 'aucun', hops: 1 })).toBe(SOCKET);
  });

  it('derrière Cloudflare, lit CF-Connecting-IP', () => {
    const cf = headers({ 'cf-connecting-ip': '203.0.113.8', 'x-forwarded-for': '198.51.100.1' });
    expect(resolveClientIp(cf, SOCKET, { trust: 'cloudflare', hops: 1 })).toBe('203.0.113.8');
  });

  it('avec x-forwarded-for, remonte du nombre de proxys de confiance', () => {
    const chain = headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7, 10.0.0.9' });
    expect(resolveClientIp(chain, SOCKET, { trust: 'x-forwarded-for', hops: 1 })).toBe('10.0.0.9');
    expect(resolveClientIp(chain, SOCKET, { trust: 'x-forwarded-for', hops: 2 })).toBe(
      '203.0.113.7',
    );
  });

  it("garde la connexion si l'en-tête du proxy manque ou n'est pas une adresse", () => {
    const policy = { trust: 'x-forwarded-for', hops: 1 } as const;
    expect(resolveClientIp(headers({}), SOCKET, policy)).toBe(SOCKET);
    expect(resolveClientIp(headers({ 'x-forwarded-for': 'pas-une-ip' }), SOCKET, policy)).toBe(
      SOCKET,
    );
    expect(resolveClientIp(headers({}), undefined, policy)).toBe(UNKNOWN_IP);
  });

  it('ramène une IPv4 vue en IPv6 à sa forme courte', () => {
    expect(resolveClientIp(headers({}), '::ffff:203.0.113.7', { trust: 'aucun', hops: 1 })).toBe(
      '203.0.113.7',
    );
  });

  it('chaque visiteur derrière le proxy a sa propre limite', async () => {
    const { app } = await testApp({ env: { TRUST_PROXY: 'x-forwarded-for', RATE_LIMIT_MAX: '1' } });
    const from = (ip: string) =>
      app.request('/api/nulle-part', { headers: { 'x-forwarded-for': ip } });
    expect((await from('203.0.113.1')).status).toBe(404);
    expect((await from('203.0.113.1')).status).toBe(429);
    expect((await from('203.0.113.2')).status).toBe(404);
  });
});
