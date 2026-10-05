import {
  canManageDocument,
  type DocumentAccess,
  type DocumentItem,
} from '@documental/contracts/documents';
import type { SessionUser } from '@/auth/middleware';
import type { DocumentStore } from '@/documents/store';

export const CREATORS: readonly string[] = ['admin', 'editeur'];
export const ACCESS_CHANNEL = 'documental_droits';

export function canCreate(user: Pick<SessionUser, 'role'>): boolean {
  return CREATORS.includes(user.role);
}

export async function accessTo(
  store: DocumentStore,
  user: Pick<SessionUser, 'id' | 'role'>,
  item: Pick<DocumentItem, 'id' | 'createdBy'>,
): Promise<DocumentAccess> {
  const manage = canManageDocument(user, item);
  return { manage, write: manage || (await store.isCollaborator(item.id, user.id)) };
}
