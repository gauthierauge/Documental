import { PASSWORD_MAX, PASSWORD_MIN, passwordProblem } from '@documental/contracts/password-policy';

describe('Règles de mot de passe', () => {
  it('demande une longueur, sans règle de composition', () => {
    expect(passwordProblem('a'.repeat(PASSWORD_MIN - 1))).toContain(`${PASSWORD_MIN} caractères`);
    expect(passwordProblem('x'.repeat(PASSWORD_MAX + 1))).toContain(`${PASSWORD_MAX} caractères`);
    expect(passwordProblem('les volets bleus de la grange')).toBeNull();
    expect(passwordProblem('919283746501')).toBeNull();
  });

  it('refuse les mots de passe essayés en premier', () => {
    for (const common of [
      'motdepasse123',
      'Motdepasse2026!',
      'P@ssw0rd1234',
      'azertyuiop12',
      'qwertyuiopas',
      '123456789012',
      'aaaaaaaaaaaa',
      'azerazerazer',
      '1qaz2wsx3edc',
      '2026soleil!!',
      'documental2026!',
    ]) {
      expect(passwordProblem(common), common).not.toBeNull();
    }
  });
});
