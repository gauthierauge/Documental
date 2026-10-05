import { type FormEvent, useEffect, useState } from 'react';
import type { SettingConfig } from '@documental/contracts/admin-types';
import { ApiError, api } from '@/api';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox, Field, Input, Textarea } from '@/ui/Field';

export function Settings() {
  const [settings, setSettings] = useState<SettingConfig[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api<{ settings: SettingConfig[]; values: Record<string, unknown> }>('/admin/reglages')
      .then((data) => {
        setSettings(data.settings);
        setValues(data.values);
      })
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : 'Erreur'));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    try {
      const data = await api<{ values: Record<string, unknown> }>('/admin/reglages', {
        method: 'PUT',
        body: JSON.stringify(values),
      });
      setValues(data.values);
      setMessage('Réglages enregistrés.');
    } catch (e) {
      if (e instanceof ApiError && e.body.fields) setErrors(e.body.fields);
      setMessage(e instanceof Error ? e.message : 'Erreur');
    }
  }

  return (
    <>
      <h1>Réglages</h1>
      <Card>
        <form className="adm-form" onSubmit={save} noValidate>
          {settings.map((s) => {
            const value = values[s.key];
            const set = (v: unknown) => setValues((all) => ({ ...all, [s.key]: v }));
            const label = (
              <>
                {s.label}
                {s.public && <small> · visible publiquement</small>}
              </>
            );
            if (s.type === 'oui_non')
              return (
                <Checkbox
                  key={s.key}
                  label={label}
                  checked={Boolean(value)}
                  onChange={(e) => set(e.target.checked)}
                />
              );
            return (
              <Field key={s.key} label={label} error={errors[s.key]}>
                {(control) =>
                  s.type === 'texte_long' || s.type === 'horaires' ? (
                    <Textarea
                      {...control}
                      rows={s.type === 'horaires' ? 7 : 4}
                      value={String(value ?? '')}
                      placeholder={
                        s.type === 'horaires' ? 'Lundi : 7 h – 19 h\nMardi : 7 h – 19 h' : undefined
                      }
                      onChange={(e) => set(e.target.value)}
                    />
                  ) : s.type === 'nombre' ? (
                    <Input
                      {...control}
                      type="number"
                      value={value === null || value === undefined ? '' : String(value)}
                      onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))}
                    />
                  ) : (
                    <Input
                      {...control}
                      type={s.type === 'email' ? 'email' : 'text'}
                      value={String(value ?? '')}
                      onChange={(e) => set(e.target.value)}
                    />
                  )
                }
              </Field>
            );
          })}
          <div className="adm-form-foot ui-actions">
            <Button type="submit" variant="primaire">
              Enregistrer
            </Button>
            {message && <span role="status">{message}</span>}
          </div>
        </form>
      </Card>
    </>
  );
}
