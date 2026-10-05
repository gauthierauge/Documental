// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CollaboratorList } from '@documental/contracts/documents';
import { Collaborators } from '@/invitations/Collaborators';

function respond(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const list: CollaboratorList = {
  owner: { id: 'u1', name: 'Alice' },
  collaborators: [
    { id: 'u2', name: 'Bob', email: 'bob@exemple.fr', invitedAt: '2026-10-05T10:00:00.000Z' },
  ],
  canManage: true,
};

function serve(current: CollaboratorList) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') return respond({ emailSent: true }, 201);
    if (init?.method === 'DELETE') return respond(null, 204);
    if (url.includes('/invitables'))
      return respond({ accounts: [{ id: 'u3', name: 'Chloé', email: 'chloe@exemple.fr' }] });
    return respond(current);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Personnes d’un document', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('montre le créateur et les invités', async () => {
    serve(list);
    render(<Collaborators documentId="d1" userId="u1" canWrite online={new Set(['u2'])} />);
    const people = await screen.findByRole('list', { name: 'Personnes avec accès' });
    expect(people).toHaveTextContent('Alice (vous)');
    expect(people).toHaveTextContent('Propriétaire');
    expect(people).toHaveTextContent('bob@exemple.fr');
    expect(within(people).getAllByText('en ligne')).toHaveLength(2);
  });

  it('cherche un compte et l’invite', async () => {
    const fetchMock = serve(list);
    render(<Collaborators documentId="d1" userId="u1" canWrite />);
    fireEvent.change(await screen.findByLabelText(/Inviter une personne/), {
      target: { value: 'chl' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Inviter Chloé' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/documents/d1/collaborateurs',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ userId: 'u3' }) }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Chloé peut maintenant modifier ce document : un e-mail lui a été envoyé.',
    );
  });

  it('retire un invité', async () => {
    const fetchMock = serve(list);
    render(<Collaborators documentId="d1" userId="u1" canWrite />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer Bob' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/documents/d1/collaborateurs/u2',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('explique à un lecteur comment obtenir le droit d’écrire, sans lui proposer d’inviter', async () => {
    serve({ ...list, canManage: false });
    render(<Collaborators documentId="d1" userId="u9" canWrite={false} />);
    expect(await screen.findByText(/demandez à Alice de vous inviter/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Inviter une personne/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('laisse un invité se retirer lui-même', async () => {
    serve({ ...list, canManage: false });
    render(<Collaborators documentId="d1" userId="u2" canWrite />);
    expect(await screen.findByRole('button', { name: 'Me retirer' })).toBeInTheDocument();
  });
});
