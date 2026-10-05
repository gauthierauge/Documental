import { type FormEvent, useState } from 'react';
import { Link, navigate } from '@/router';
import { Button } from '@/ui/Button';
import { Field, Input } from '@/ui/Field';
import { Notice } from '@/ui/Notice';
import { Page } from '@/ui/Page';
import { authClient, errorMessage } from './client';

type Step = { kind: 'identifiants' } | { kind: 'code'; backup: boolean };

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('suite');
  // Seulement un chemin interne : pas de redirection vers un autre site.
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/compte';
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'identifiants' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordSet = new URLSearchParams(window.location.search).get('mdp') === 'ok';

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: failure } = await authClient.signIn.email({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (failure) {
      setError(errorMessage(failure));
      return;
    }
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      setPassword('');
      setStep({ kind: 'code', backup: false });
      return;
    }
    navigate(nextPath());
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== 'code') return;
    setBusy(true);
    setError(null);
    const value = code.replace(/\s/g, '');
    const { error: failure } = step.backup
      ? await authClient.twoFactor.verifyBackupCode({ code: value })
      : await authClient.twoFactor.verifyTotp({ code: value });
    setBusy(false);
    if (failure) {
      setError(errorMessage(failure));
      if (failure.code === 'INVALID_TWO_FACTOR_COOKIE') setStep({ kind: 'identifiants' });
      return;
    }
    navigate(nextPath());
  }

  if (step.kind === 'code') {
    return (
      <Page title="Double authentification" narrow>
        <form onSubmit={verify} className="ui-formulaire">
          <Field label={step.backup ? 'Code de secours' : 'Code à 6 chiffres de votre application'}>
            {(control) => (
              <Input
                {...control}
                inputMode={step.backup ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="primaire" disabled={busy}>
            {busy ? 'Vérification…' : 'Valider'}
          </Button>
        </form>
        <Button
          variant="discret"
          onClick={() => {
            setCode('');
            setStep({ kind: 'code', backup: !step.backup });
          }}
        >
          {step.backup ? 'Utiliser le code de l’application' : 'Utiliser un code de secours'}
        </Button>
        {error && <Notice tone="danger">{error}</Notice>}
      </Page>
    );
  }

  return (
    <Page title="Connexion" narrow>
      {passwordSet && (
        <Notice tone="succes">Mot de passe enregistré : vous pouvez vous connecter.</Notice>
      )}
      <form onSubmit={signIn} className="ui-formulaire">
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
        <Field label="Mot de passe">
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primaire" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
      {error && <Notice tone="danger">{error}</Notice>}
      <p>
        <Link href="/mot-de-passe/oublie">Mot de passe oublié ?</Link>
      </p>
    </Page>
  );
}
