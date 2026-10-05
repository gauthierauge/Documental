import { testApp } from '@/test/support/helpers';

describe('Santé de la base', () => {
  it('répond par une vraie requête, sans rien révéler', async () => {
    const { app } = await testApp();
    const response = await app.request('/api/health/base');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
