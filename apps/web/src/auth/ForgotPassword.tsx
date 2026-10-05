import { type FormEvent, useState } from 'react';
import { Link } from '@/router';
import { Button } from '@/ui/Button';
import { Field, Input } from '@/ui/Field';
import { Notice } from '@/ui/Notice';
import { Page } from '@/ui/Page';
import { authClient, errorMessage } from './client';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: failure } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: '/mot-de-passe/nouveau',
    });
    setBusy(false);
    if (failure) setError(errorMessage(failure));
    else setSentTo(email.trim());
  }

  return (
    <Page title="Mot de passe oublié" narrow>
      {sentTo ? (
        <Notice tone="succes">
          Si un compte existe pour {sentTo}, un lien pour choisir un nouveau mot de passe vient de
          partir. Il est valable 1 heure.
        </Notice>
      ) : (
        <form onSubmit={ask} className="ui-formulaire">
          <Field label="Adresse e-mail">
            {(control) => (
              <Input
                {...control}
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="primaire" disabled={busy}>
            {busy ? 'Envoi…' : 'Recevoir le lien'}
          </Button>
        </form>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <p>
        <Link href="/connexion">Retour à la connexion</Link>
      </p>
    </Page>
  );
}
