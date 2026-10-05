import { CheckCard } from './CheckCard';

export function DockerCheck() {
  return (
    <CheckCard
      title="Docker"
      status={{ tone: 'neutre', label: 'À lancer' }}
      how={
        <pre>
          {
            'make smoke   # construit, démarre, vérifie, nettoie\nmake up      # essai local, puis make logs, make down'
          }
        </pre>
      }
    >
      <p>
        L’image de production (Dockerfile, non root, lecture seule) et sa base (compose.yaml). Les
        secrets viennent du .env, jamais de l’image.
      </p>
    </CheckCard>
  );
}
