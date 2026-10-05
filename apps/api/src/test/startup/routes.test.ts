import { testApp } from '@/test/support/helpers';
import { createApp } from '@/app';

describe('Page « Démarrage » (API)', () => {
  it("donne l'état des modules hors production", async () => {
    const { app } = await testApp();
    const response = await app.request('/api/demarrage');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ environnement: 'test' });
  });

  it("n'existe pas en production", async () => {
    const { deps } = await testApp();
    const app = createApp({ ...deps, env: { ...deps.env, NODE_ENV: 'production' } });
    expect((await app.request('/api/demarrage')).status).toBe(404);
  });
});
