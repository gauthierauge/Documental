import { useEffect, useState } from 'react';
import type { CollaboratorList, InvitableAccount } from '@documental/contracts/documents';
import { api, ApiError } from '@/api';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Field, Input } from '@/ui/Field';
import { Notice } from '@/ui/Notice';
import '@/invitations/invitations.css';

function failure(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Action impossible pour le moment, réessayez.';
}

export function Collaborators({
  documentId,
  userId,
  canWrite,
}: {
  documentId: string;
  userId: string;
  canWrite: boolean;
}) {
  const base = `/documents/${encodeURIComponent(documentId)}`;
  const [list, setList] = useState<CollaboratorList | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InvitableAccount[]>([]);
  const [notice, setNotice] = useState<{ tone: 'succes' | 'danger'; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<CollaboratorList>(`${base}/collaborateurs`)
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setNotice({ tone: 'danger', text: failure(caught) }));
    return () => {
      active = false;
    };
  }, [base, version]);

  useEffect(() => {
    const q = query.trim();
    if (!list?.canManage || q.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      api<{ accounts: InvitableAccount[] }>(`${base}/invitables?q=${encodeURIComponent(q)}`)
        .then((result) => active && setResults(result.accounts))
        .catch(() => active && setResults([]));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [base, query, list?.canManage, version]);

  async function invite(account: InvitableAccount) {
    setBusy(true);
    setNotice(null);
    try {
      const { emailSent } = await api<{ emailSent: boolean }>(`${base}/collaborateurs`, {
        method: 'POST',
        body: JSON.stringify({ userId: account.id }),
      });
      setNotice({
        tone: 'succes',
        text: emailSent
          ? `${account.name} peut maintenant modifier ce document : un e-mail lui a été envoyé.`
          : `${account.name} peut maintenant modifier ce document, mais l’e-mail n’a pas pu partir.`,
      });
      setQuery('');
      setVersion((v) => v + 1);
    } catch (caught) {
      setNotice({ tone: 'danger', text: failure(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    setBusy(true);
    setNotice(null);
    try {
      await api(`${base}/collaborateurs/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setNotice({
        tone: 'succes',
        text: id === userId ? 'Vous ne participez plus à ce document.' : `${name} est retiré.`,
      });
      setVersion((v) => v + 1);
    } catch (caught) {
      setNotice({ tone: 'danger', text: failure(caught) });
    } finally {
      setBusy(false);
    }
  }

  if (!list) return notice ? <Notice tone="danger">{notice.text}</Notice> : null;

  return (
    <Card title="Personnes">
      {!canWrite && (
        <p>
          Vous lisez ce document.
          {list.owner ? ` Pour le modifier, demandez à ${list.owner.name} de vous inviter.` : ''}
        </p>
      )}
      <ul className="inv-liste">
        {list.owner && (
          <li>
            <span className="inv-nom">{list.owner.name}</span>
            <span className="inv-role">A créé le document</span>
          </li>
        )}
        {list.collaborators.map((person) => (
          <li key={person.id}>
            <span className="inv-nom">{person.name}</span>
            <span className="inv-role">{person.email}</span>
            {(list.canManage || person.id === userId) && (
              <Button
                variant="discret"
                disabled={busy}
                aria-label={person.id === userId ? 'Me retirer' : `Retirer ${person.name}`}
                onClick={() => remove(person.id, person.name)}
              >
                {person.id === userId ? 'Me retirer' : 'Retirer'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {list.collaborators.length === 0 && (
        <p className="inv-role">Personne d’autre n’est invité pour l’instant.</p>
      )}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {list.canManage && (
        <div className="inv-recherche">
          <Field label="Inviter une personne" hint="Nom ou adresse e-mail, deux lettres au moins.">
            {(control) => (
              <Input
                {...control}
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </Field>
          {results.length > 0 && (
            <ul className="inv-liste" aria-label="Comptes trouvés">
              {results.map((account) => (
                <li key={account.id}>
                  <span className="inv-nom">{account.name}</span>
                  <span className="inv-role">{account.email}</span>
                  <Button
                    disabled={busy}
                    aria-label={`Inviter ${account.name}`}
                    onClick={() => invite(account)}
                  >
                    Inviter
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && results.length === 0 && (
            <p className="inv-role">Aucun compte à inviter ne correspond.</p>
          )}
        </div>
      )}
    </Card>
  );
}
