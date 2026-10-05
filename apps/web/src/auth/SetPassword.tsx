import { type FormEvent, useState } from 'react';
import { Link, navigate } from '@/router';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Notice';
import { Page } from '@/ui/Page';
import { authClient, errorMessage, passwordProblem } from './client';
import { NewPasswordField } from './NewPasswordField';

// Le lien reçu par e-mail (invitation ou mot de passe oublié) arrive ici avec son jeton.

export function SetPassword() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (!token) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (failure) {
      setError(errorMessage(failure));
      return;
    }
    navigate('/connexion?mdp=ok');
  }

  if (!token || params.get('error')) {
    return (
      <Page
        title="Lien expiré"
        lede="Ce lien n’est plus valable : il a déjà servi ou il a expiré."
        narrow
      >
        <p>
          <Link href="/mot-de-passe/oublie">Recevoir un nouveau lien</Link>
        </p>
      </Page>
    );
  }

  return (
    <Page title="Choisir votre mot de passe" narrow>
      <form onSubmit={save} className="ui-formulaire">
        <NewPasswordField value={password} onChange={setPassword} />
        <Button type="submit" variant="primaire" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
      {error && <Notice tone="danger">{error}</Notice>}
    </Page>
  );
}
