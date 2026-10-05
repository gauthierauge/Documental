import { useId, useState } from 'react';
import './ui.css';

export type Appearance = 'systeme' | 'clair' | 'sombre';

export const DEFAULT_APPEARANCE: Appearance = 'systeme';

const KEY = 'apparence';

function stored(): Appearance {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'systeme' || value === 'clair' || value === 'sombre'
      ? value
      : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function applyAppearance(appearance: Appearance = stored()): void {
  if (appearance === 'systeme') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = appearance;
}

export function AppearanceSwitch() {
  const id = useId();
  const [value, setValue] = useState<Appearance>(stored);
  return (
    <span className="ui-apparence">
      <label htmlFor={id}>Apparence</label>
      <select
        id={id}
        className="ui-champ ui-champ-compact"
        value={value}
        onChange={(event) => {
          const next = event.target.value as Appearance;
          setValue(next);
          applyAppearance(next);
          try {
            if (next === DEFAULT_APPEARANCE) localStorage.removeItem(KEY);
            else localStorage.setItem(KEY, next);
          } catch {}
        }}
      >
        <option value="systeme">Comme le système</option>
        <option value="clair">Clair</option>
        <option value="sombre">Sombre</option>
      </select>
    </span>
  );
}
