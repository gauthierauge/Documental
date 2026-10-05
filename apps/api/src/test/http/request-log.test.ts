import { testApp } from '@/test/support/helpers';
import { maskedPath } from '@/http/request-log';

describe('journal des requêtes', () => {
  it('écrit une ligne JSON par requête, sans paramètres ni adresse IP', async () => {
    const lines: string[] = [];
    const { app } = await testApp({ log: (line) => lines.push(line) });
    const response = await app.request('/api/health?email=compte@exemple.fr', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? '{}');
    expect(entry).toMatchObject({ methode: 'GET', chemin: '/api/health', statut: 200 });
    expect(entry.id).toBe(response.headers.get('x-request-id'));
    expect(typeof entry.duree_ms).toBe('number');
    expect(lines[0]).not.toContain('exemple.fr');
    expect(lines[0]).not.toContain('203.0.113.7');
  });

  it('masque jetons et identifiants dans le chemin', async () => {
    expect(maskedPath('/api/auth/reset-password/AbC123xyz')).toBe(
      '/api/auth/reset-password/:param',
    );
    expect(maskedPath('/api/fichiers/u_12/2026/f.pdf')).toBe('/api/fichiers/:param/:param/:param');
    const lines: string[] = [];
    const { app } = await testApp({ log: (line) => lines.push(line) });
    await app.request('/api/compte/jean.dupont@exemple.fr');
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      chemin: '/api/compte/:param',
      statut: 404,
    });
  });

  it('reprend un X-Request-Id valide, en génère un sinon', async () => {
    const { app } = await testApp();
    const kept = await app.request('/api/health', { headers: { 'x-request-id': 'proxy-42' } });
    expect(kept.headers.get('x-request-id')).toBe('proxy-42');
    const replaced = await app.request('/api/health', {
      headers: { 'x-request-id': 'pas valide<script>' },
    });
    expect(replaced.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reste muet pendant les tests', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { app } = await testApp();
    await app.request('/api/health');
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
