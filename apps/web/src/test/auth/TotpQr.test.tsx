import { render, screen } from '@testing-library/react';
import { TotpQr } from '@/auth/TotpQr';

describe('Écrans de connexion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState(null, '', '/');
  });

  it('dessine le QR code sans service extérieur et montre la clé', () => {
    render(
      <TotpQr uri="otpauth://totp/Essai:claire%40exemple.fr?secret=FAUXSECRETDETEST&issuer=Essai" />,
    );
    expect(screen.getByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(screen.getByText('FAUX SECR ETDE TEST')).toBeInTheDocument();
  });
});
