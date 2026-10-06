import { Hono, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Deps } from '@/app';
import { requireUser, type SessionUser } from '@/auth/middleware';
import { type CommunicationConnection, CommunicationHub } from '@/communication/hub';
import { CommunicationStore } from '@/communication/store';
import { DocumentStore } from '@/documents/store';
import type { WebRtcConfiguration } from '@documental/contracts/communication';

function currentUser(c: { get(key: 'user'): SessionUser | null }): SessionUser {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Connexion requise' });
  return user;
}

export function communicationRoutes(deps: Deps) {
  const hub = new CommunicationHub(new CommunicationStore(deps.db), deps.listen);
  const documents = new DocumentStore(deps.db);
  const app = new Hono();
  const allowedOrigin = new URL(deps.env.APP_URL).origin;

  const live: MiddlewareHandler = deps.upgradeWebSocket
    ? deps.upgradeWebSocket((c) => {
        const user = currentUser(c);
        const documentId = c.req.param('id') ?? '';
        let connection: CommunicationConnection | null = null;
        return {
          onOpen(_event, ws) {
            connection = {
              user,
              send(message) {
                if (ws.readyState === 1) ws.send(JSON.stringify(message));
              },
              close(code, reason) {
                ws.close(code, reason);
              },
            };
            hub.join(documentId, connection).catch(() => ws.close(1011, 'Erreur interne'));
          },
          onMessage(event, ws) {
            if (!connection) return;
            if (typeof event.data !== 'string') {
              ws.close(1003, 'Texte attendu');
              return;
            }
            hub
              .receive(documentId, connection, event.data)
              .catch(() => ws.close(1011, 'Erreur interne'));
          },
          onClose() {
            if (connection) hub.leave(documentId, connection);
          },
        };
      })
    : async (c) => c.json({ error: 'WebSocket attendu' }, 426);

  app.use('*', requireUser());
  app.get(
    '/:id/communication',
    async (c, next) => {
      if (c.req.header('origin') !== allowedOrigin) {
        throw new HTTPException(403, { message: 'Origine refusée' });
      }
      if (!(await documents.get(c.req.param('id')))) {
        throw new HTTPException(404, { message: 'Document introuvable' });
      }
      await next();
    },
    live,
  );

  return app;
}

export function communicationConfigRoutes(deps: Deps) {
  const app = new Hono();
  app.use('*', requireUser());
  app.get('/webrtc', (c) => {
    const iceServers: RTCIceServer[] = deps.env.WEBRTC_STUN_URL
      ? [{ urls: deps.env.WEBRTC_STUN_URL }]
      : [];
    if (deps.env.WEBRTC_TURN_URL) {
      iceServers.push({
        urls: deps.env.WEBRTC_TURN_URL,
        username: deps.env.WEBRTC_TURN_USERNAME ?? '',
        credential: deps.env.WEBRTC_TURN_CREDENTIAL ?? '',
      });
    }
    const result: WebRtcConfiguration = { iceServers };
    return c.json(result);
  });
  return app;
}
