import type { CommunicationServerMessage } from '@documental/contracts/communication';
import type { SessionUser } from '@/auth/middleware';

export interface CommunicationConnection {
  readonly user: SessionUser;
  send(message: CommunicationServerMessage): void;
  close(code: number, reason: string): void;
}
