import { type FormEvent, useEffect, useState } from 'react';
import { navigate } from '@/router';
import { AppearanceSwitch } from '@/ui/AppearanceSwitch';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Field, Input } from '@/ui/Field';
import { Notice } from '@/ui/Notice';
import { Page } from '@/ui/Page';
import { authClient, errorMessage, passwordProblem, useCurrentUser } from './client';
import { NewPasswordField } from './NewPasswordField';
import { TotpQr } from './TotpQr';
import './auth.css';

const ROLE_LABEL = { admin: 'Admin', editeur: 'Éditeur', lecteur: 'Lecteur' } as const;

type TwoFactorStep =
  | { kind: 'repos' }
  | { kind: 'scan'; totpURI: string; backupCodes: string[] }
  | { kind: 'codes'; backupCodes: string[] };

function PasswordInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      {(control) => (
        <Input
          {...control}
          type="password"
          autoComplete="current-password"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function TwoFactor({ enabled, admin }: { enabled: boolean; admin: boolean }) {
  const [step, setStep] = useState<TwoFactorStep>({ kind: 'repos' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function start(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setPassword('');
    if (error || !data || !('totpURI' in data) || !data.totpURI) {
      setMessage(error ? errorMessage(error) : 'Activation impossible, réessayez.');
      return;
    }
    setStep({ kind: 'scan', totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== 'scan') return;
    setMessage(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, '') });
    setCode('');
    if (error) {
      setMessage(errorMessage(error));
      return;
    }
    setStep({ kind: 'codes', backupCodes: step.backupCodes });
  }

  async function disable(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const { error } = await authClient.twoFactor.disable({ password });
    setPassword('');
    setMessage(error ? errorMessage(error) : 'Double authentification désactivée.');
  }

  if (step.kind === 'codes') {
    return (
      <Card title="Double authentification">
        <Notice tone="succes">
          Activée. Gardez ces codes de secours hors ligne : chacun remplace une fois le code de
          l’application, si vous perdez votre téléphone. Ils ne s’afficheront plus.
        </Notice>
        <ul className="auth-codes">
          {step.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button onClick={() => setStep({ kind: 'repos' })}>J’ai noté mes codes</Button>
      </Card>
    );
  }

  return (
    <Card title="Double authentification">
      {step.kind === 'scan' ? (
        <form onSubmit={confirm} className="ui-formulaire">
          <p>
            Scannez ce QR code avec votre application d’authentification, puis saisissez le code
            affiché.
          </p>
          <TotpQr uri={step.totpURI} />
          <Field label="Code à 6 chiffres">
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="primaire">
            Confirmer
          </Button>
        </form>
      ) : enabled ? (
        <>
          <Notice tone="succes">
            Activée : chaque connexion demande un code de votre application.
          </Notice>
          {admin ? (
            <p>Obligatoire pour les admins : elle ne peut pas être désactivée.</p>
          ) : (
            <form onSubmit={disable} className="ui-formulaire">
              <PasswordInput
                label="Mot de passe, pour désactiver"
                value={password}
                onChange={setPassword}
              />
              <Button type="submit" variant="danger">
                Désactiver
              </Button>
            </form>
          )}
        </>
      ) : (
        <form onSubmit={start} className="ui-formulaire">
          {admin ? (
            <Notice tone="attention">
              Obligatoire pour les admins : sans elle, les comptes et les réglages du panel restent
              fermés.
            </Notice>
          ) : (
            <p>Recommandée : un code de votre téléphone en plus du mot de passe.</p>
          )}
          <PasswordInput label="Mot de passe" value={password} onChange={setPassword} />
          <Button type="submit" variant="primaire">
            Activer la double authentification
          </Button>
        </form>
      )}
      {message && <Notice>{message}</Notice>}
    </Card>
  );
}

function Profile({ name }: { name: string }) {
  const [newName, setNewName] = useState(name);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (newName.trim() === '') {
      setMessage('Le nom ne peut pas être vide.');
      return;
    }
    const { error } = await authClient.updateUser({ name: newName.trim() });
    setMessage(error ? errorMessage(error) : 'Profil mis à jour.');
  }

  return (
    <Card title="Profil">
      <form onSubmit={save} className="ui-formulaire">
        <Field label="Nom">
          {(control) => (
            <Input
              {...control}
              autoComplete="name"
              required
              maxLength={100}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit">Enregistrer</Button>
        {message && <Notice>{message}</Notice>}
      </form>
    </Card>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(next);
    if (problem) {
      setMessage(problem);
      return;
    }
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setMessage(
      error ? errorMessage(error) : 'Mot de passe changé. Les autres sessions sont fermées.',
    );
    if (!error) {
      setCurrent('');
      setNext('');
    }
  }

  return (
    <Card title="Mot de passe">
      <form onSubmit={save} className="ui-formulaire">
        <PasswordInput label="Mot de passe actuel" value={current} onChange={setCurrent} />
        <NewPasswordField value={next} onChange={setNext} />
        <Button type="submit">Changer le mot de passe</Button>
        {message && <Notice>{message}</Notice>}
      </form>
    </Card>
  );
}

export function Account() {
  const { user, pending } = useCurrentUser();

  useEffect(() => {
    if (!pending && !user) navigate(`/connexion?suite=${encodeURIComponent('/compte')}`);
  }, [pending, user]);

  if (!user) return null;

  async function signOut() {
    await authClient.signOut();
    navigate('/connexion');
  }

  return (
    <Page title="Mon compte" lede={`${user.email} · ${ROLE_LABEL[user.role]}`} narrow>
      <Profile name={user.name} />
      <TwoFactor enabled={user.twoFactorEnabled} admin={user.role === 'admin'} />
      <ChangePassword />
      <Card title="Apparence">
        <AppearanceSwitch />
      </Card>
      <div className="ui-actions">
        <Button onClick={signOut}>Se déconnecter</Button>
      </div>
    </Page>
  );
}
