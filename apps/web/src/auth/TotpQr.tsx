import { generate } from 'lean-qr';
import { toSvgPath } from 'lean-qr/extras/svg';

export function TotpQr({ uri }: { uri: string }) {
  const code = generate(uri);
  const secret = new URL(uri).searchParams.get('secret') ?? '';
  return (
    <>
      <svg
        className="auth-qr"
        viewBox={`-4 -4 ${code.size + 8} ${code.size + 8}`}
        role="img"
        aria-label="QR code à scanner avec l’application d’authentification"
      >
        <rect x={-4} y={-4} width={code.size + 8} height={code.size + 8} fill="#fff" />
        <path d={toSvgPath(code)} fill="#000" shapeRendering="crispEdges" />
      </svg>
      <p>
        Impossible de scanner ? Saisissez cette clé dans l’application :{' '}
        <span className="auth-secret">{secret.replace(/(.{4})/g, '$1 ').trim()}</span>
      </p>
    </>
  );
}
