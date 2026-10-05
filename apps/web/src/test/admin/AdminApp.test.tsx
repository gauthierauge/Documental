// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { adminConfig } from '@documental/contracts/admin.config';
import { AdminApp, adminScreen } from '@/admin/AdminApp';
import type { AdminMeta } from '@/admin/meta';

const meta = {
  user: {
    id: 'u1',
    email: 'claire@exemple.fr',
    name: 'Claire',
    role: 'editeur',
    roleLabel: 'Éditeur',
    strongFactor: true,
  },
  strongFactor: { label: 'Facteur fort', missing: 'Ajoutez un facteur fort', none: 'aucun' },
  access: { invited: 'Invitation envoyée à {email}.', resend: 'Renvoyer un lien' },
  sections: adminConfig.sections,
  entities: adminConfig.entities.map((e) => ({ ...e, allowed: ['lire', 'creer', 'modifier'] })),
  settings: [],
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Panel admin (écrans)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('affiche un menu tiré de la configuration, sans comptes pour un éditeur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/admin/meta')) return respond(meta);
        if (url.endsWith('/admin/accueil')) return respond({ cards: [], journal: [] });
        return respond({ rows: [], total: 0, perPage: 25, labels: {} });
      }),
    );
    window.history.pushState(null, '', '/admin');
    render(<AdminApp />);
    for (const entity of adminConfig.entities) {
      expect(await screen.findByRole('link', { name: entity.label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Comptes' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Journal' })).toBeInTheDocument();
  });

  it('aucun écran pour un contenu inconnu, ni pour une section réservée à un autre rôle', () => {
    const editor = meta as AdminMeta;
    expect(adminScreen(editor, 'contenu-inconnu', '')).toBeNull();
    expect(adminScreen(editor, 'comptes', '')).toBeNull();
    expect(adminScreen(editor, 'journal', '')).not.toBeNull();
    for (const entity of adminConfig.entities) {
      expect(adminScreen(editor, entity.key, '')).not.toBeNull();
      expect(adminScreen(editor, entity.key, 'nouveau')).not.toBeNull();
    }
  });
});
