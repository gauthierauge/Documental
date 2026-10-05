import { render, screen } from '@testing-library/react';
import { AdminNav } from '@/admin/AdminNav';
import { type CurrentUser, useCurrentUser } from '@/auth/client';

vi.mock('@/auth/client', () => ({ useCurrentUser: vi.fn() }));

function as(role: CurrentUser['role'] | null) {
  const user = role
    ? ({ id: 'u1', email: 'compte@exemple.fr', name: 'Compte', role } as CurrentUser)
    : null;
  vi.mocked(useCurrentUser).mockReturnValue({ user, pending: false });
}

describe('Lien du panel admin', () => {
  it.each([
    ['admin', true],
    ['editeur', true],
    ['lecteur', false],
    [null, false],
  ] as const)('rôle %s : lien affiché = %s', (role, shown) => {
    as(role);
    render(<AdminNav />);
    expect(screen.queryByRole('link', { name: 'Admin' }) !== null).toBe(shown);
  });
});
