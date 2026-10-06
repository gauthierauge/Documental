import { fireEvent, render, screen } from '@testing-library/react';
import { AppearanceSwitch, applyAppearance, DEFAULT_APPEARANCE } from '@/ui/AppearanceSwitch';

const OTHER = DEFAULT_APPEARANCE === 'sombre' ? 'clair' : 'sombre';

describe('Apparence', () => {
  afterEach(() => {
    localStorage.clear();
    applyAppearance('systeme');
  });

  it('sans choix enregistré, applique le mode par défaut du projet', () => {
    applyAppearance();
    const expected = DEFAULT_APPEARANCE === 'systeme' ? undefined : DEFAULT_APPEARANCE;
    expect(document.documentElement.dataset.theme).toBe(expected);
  });

  it('force le mode choisi avec data-theme et le retient ; le mode par défaut ne s’enregistre pas', () => {
    render(<AppearanceSwitch />);
    const select = screen.getByLabelText('Apparence');
    fireEvent.change(select, { target: { value: OTHER } });
    expect(document.documentElement.dataset.theme).toBe(OTHER);
    expect(localStorage.getItem('apparence')).toBe(OTHER);
    fireEvent.change(select, { target: { value: DEFAULT_APPEARANCE } });
    expect(localStorage.getItem('apparence')).toBeNull();
  });

  it('réapplique le choix enregistré au démarrage', () => {
    localStorage.setItem('apparence', 'clair');
    applyAppearance();
    expect(document.documentElement.dataset.theme).toBe('clair');
  });
});
