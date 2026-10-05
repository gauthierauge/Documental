import { testApp } from './support/helpers';
import { readEnv } from '@/env';

describe('API', () => {
  it('répond sur /api/health', async () => {
    const { app } = await testApp();
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, env: 'test' });
  });

  it('renvoie 404 en JSON pour une route inconnue', async () => {
    const { app } = await testApp();
    const response = await app.request('/api/nulle-part');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Introuvable' });
  });

  it('pose les en-têtes de sécurité', async () => {
    const { app } = await testApp();
    const response = await app.request('/api/health');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it("refuse une configuration d'environnement invalide", () => {
    expect(() => readEnv({ PORT: 'abc' })).toThrow('PORT');
  });
});
