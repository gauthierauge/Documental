import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ROLE_LABEL, type Role } from '@documental/contracts/admin-types';
import { ApiError, api } from '@/api';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Field, Input, Select } from '@/ui/Field';
import { Notice } from '@/ui/Notice';
import { Table } from '@/ui/Table';
import { useMeta } from './meta';

interface Account {
  id: string;
  email: string;
  name: string;
  role: Role;
  strongFactor: string | null;
}

const ROLES: Role[] = ['admin', 'editeur', 'lecteur'];

export function Accounts() {
  const meta = useMeta();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editeur');
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAccounts((await api<{ accounts: Account[] }>('/admin/comptes')).accounts);
    } catch (e) {
      setBlocked(e instanceof Error ? e.message : 'Erreur');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setMessage(null);
    try {
      await fn();
      setMessage(done);
      await refresh();
    } catch (e) {
      setMessage(e instanceof ApiError ? (e.body.fields?.email ?? e.message) : 'Erreur');
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    await act(
      () => api('/admin/comptes', { method: 'POST', body: JSON.stringify({ email, role }) }),
      meta.access.invited.replace('{email}', email),
    );
    setEmail('');
  }

  if (blocked) return <Notice tone="attention">{blocked}</Notice>;

  return (
    <>
      <h1>Comptes</h1>
      <Card title="Inviter">
        <form className="adm-inline" onSubmit={invite}>
          <Field label="Adresse e-mail">
            {(control) => (
              <Input
                {...control}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field label="Rôle">
            {(control) => (
              <Select {...control} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button type="submit" variant="primaire">
            Inviter
          </Button>
        </form>
      </Card>
      {message && <Notice>{message}</Notice>}
      <Table label="Comptes">
        <thead>
          <tr>
            <th scope="col">Compte</th>
            <th scope="col">Rôle</th>
            <th scope="col">{meta.strongFactor.label}</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {accounts?.map((a) => (
            <tr key={a.id}>
              <td>{a.email}</td>
              <td>
                <Select
                  className="ui-champ-compact"
                  aria-label={`Rôle de ${a.email}`}
                  value={a.role}
                  disabled={a.id === meta.user.id}
                  onChange={(e) =>
                    act(
                      () =>
                        api(`/admin/comptes/${a.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ role: e.target.value }),
                        }),
                      'Rôle modifié.',
                    )
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </td>
              <td>
                {a.strongFactor ?? <span className="adm-muted">{meta.strongFactor.none}</span>}
              </td>
              <td>
                <div className="adm-row-actions">
                  {meta.access.resend && (
                    <Button
                      variant="discret"
                      onClick={() =>
                        act(
                          () => api(`/admin/comptes/${a.id}/lien`, { method: 'POST' }),
                          `Lien d’accès renvoyé à ${a.email}.`,
                        )
                      }
                    >
                      {meta.access.resend}
                    </Button>
                  )}
                  {a.id !== meta.user.id && (
                    <Button
                      variant="danger"
                      onClick={() =>
                        act(
                          () => api(`/admin/comptes/${a.id}`, { method: 'DELETE' }),
                          `Accès retiré à ${a.email}.`,
                        )
                      }
                    >
                      Retirer l’accès
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
