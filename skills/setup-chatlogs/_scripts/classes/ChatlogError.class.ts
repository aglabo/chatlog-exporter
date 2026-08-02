import { ERROR_KIND_LABELS } from '../constants/chatlog-error.constants.ts';
import type { ErrorKind } from '../types/chatlog-error.types.ts';

export class ChatlogError extends Error {
  readonly kind: ErrorKind;
  readonly subindex: string;

  constructor(kind: ErrorKind, subindex: string, detail?: string) {
    const _detail = detail ?? 'Undefined Error';
    super(`${ERROR_KIND_LABELS[kind]}: ${_detail}`);
    this.name = 'ChatlogError';
    this.kind = kind;
    this.subindex = subindex;
  }
}
