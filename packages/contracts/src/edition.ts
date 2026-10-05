import type { DocumentPerson } from '@documental/contracts/documents';
import type { TextOperation } from '@documental/contracts/text-operation';

export const DOCUMENT_CONTENT_MAX = 500_000;

export interface DocumentContent {
  content: string;
  revision: number;
  canEdit: boolean;
}

export interface CommittedOperation {
  id: string;
  revision: number;
  operation: TextOperation;
  author: DocumentPerson | null;
}

export interface OperationSubmission {
  id: string;
  base: number;
  operation: TextOperation;
}

export interface SubmissionResult {
  revision: number;
  missed: CommittedOperation[];
}

export interface OperationsSince {
  operations: CommittedOperation[];
}

export interface RemoteCursor {
  key: string;
  user: DocumentPerson;
  start: number;
  end: number;
}

export type ClientMessage =
  | ({ type: 'modification' } & OperationSubmission)
  | { type: 'curseur'; start: number; end: number };

export type ServerMessage =
  | ({ type: 'operation' } & CommittedOperation)
  | { type: 'pret'; revision: number }
  | { type: 'droits'; canEdit: boolean }
  | ({ type: 'curseur' } & RemoteCursor)
  | { type: 'depart'; key: string }
  | { type: 'arrivee' }
  | { type: 'erreur'; status: number; message: string; id?: string };
