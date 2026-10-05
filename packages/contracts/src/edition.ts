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

export type ClientMessage = { type: 'modification' } & OperationSubmission;

export type ServerMessage =
  | ({ type: 'operation' } & CommittedOperation)
  | { type: 'pret'; revision: number }
  | { type: 'droits'; canEdit: boolean }
  | { type: 'erreur'; status: number; message: string; id?: string };
