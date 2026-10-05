import { secureHeaders } from 'hono/secure-headers';

// En-têtes de sécurité communs. La politique de contenu (CSP) et la politique de ressource
// (CORP) dépendent du type de projet : elles sont passées par app.ts.

type SecureHeadersOptions = NonNullable<Parameters<typeof secureHeaders>[0]>;

/**
 * Fonctions du navigateur coupées pour toutes les pages : une injection de script ne peut pas
 * s'en servir. Les passkeys (publickey-credentials) gardent leur valeur par défaut ('self').
 */
export const PERMISSIONS_POLICY: NonNullable<SecureHeadersOptions['permissionsPolicy']> = {
  accelerometer: [],
  bluetooth: [],
  camera: [],
  displayCapture: [],
  geolocation: [],
  gyroscope: [],
  hid: [],
  idleDetection: [],
  magnetometer: [],
  microphone: [],
  midi: [],
  payment: [],
  serial: [],
  usb: [],
  xrSpatialTracking: [],
};

/** HSTS en production seulement : en développement, le serveur parle HTTP sur localhost. */
const HSTS = 'max-age=31536000; includeSubDomains';

export function securityHeaders(
  env: { NODE_ENV: string },
  options: Pick<SecureHeadersOptions, 'contentSecurityPolicy' | 'crossOriginResourcePolicy'>,
) {
  return secureHeaders({
    ...options,
    permissionsPolicy: PERMISSIONS_POLICY,
    strictTransportSecurity: env.NODE_ENV === 'production' ? HSTS : false,
    crossOriginOpenerPolicy: 'same-origin',
    xFrameOptions: 'DENY',
  });
}
