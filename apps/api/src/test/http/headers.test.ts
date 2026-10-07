import { testApp } from '@/test/support/helpers';

describe('en-têtes de sécurité', () => {
  it('coupe les fonctions sensibles du navigateur et isole la page', async () => {
    const { app } = await testApp();
    const response = await app.request('/api/health');
    const policy = response.headers.get('permissions-policy') ?? '';
    for (const feature of [
      'camera=()',
      'microphone=(self)',
      'geolocation=()',
      'payment=()',
      'usb=()',
    ]) {
      expect(policy).toContain(feature);
    }
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('HSTS en production seulement, sans preload', async () => {
    const dev = await testApp();
    expect(
      (await dev.app.request('/api/health')).headers.get('strict-transport-security'),
    ).toBeNull();
    const prod = await testApp({ env: { NODE_ENV: 'production' } });
    const hsts = (await prod.app.request('/api/health')).headers.get('strict-transport-security');
    expect(hsts).toBe('max-age=31536000; includeSubDomains');
  });
});
