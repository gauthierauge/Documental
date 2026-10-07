import { secureHeaders } from 'hono/secure-headers';

type SecureHeadersOptions = NonNullable<Parameters<typeof secureHeaders>[0]>;

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
  microphone: ['self'],
  midi: [],
  payment: [],
  serial: [],
  usb: [],
  xrSpatialTracking: [],
};

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
