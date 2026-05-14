import { ERROR_KIND_LABELS } from '../constants/chatlog-error.constants.ts';
import type { ErrorKind } from '../types/chatlog-error.types.ts';

export class ChatlogError extends Error {
  readonly kind: ErrorKind;
  readonly subindex: string;

  constructor(kind: ErrorKind, detail?: string);
  constructor(kind: ErrorKind, subindex: string, detail?: string);

  constructor(kind: ErrorKind, subindexOrDetail?: string, detail?: string) {
    const label = ERROR_KIND_LABELS[kind];

    let _subindex: string;
    let _detail: string;

    if (detail !== undefined) {
      _subindex = subindexOrDetail ?? '';
      _detail = detail;
    } else {
      _subindex = '';
      _detail = subindexOrDetail ?? 'Undefined Error';
    }

    super(`${label}: ${_detail}`);
    this.name = 'ChatlogError';
    this.subindex = _subindex;
    this.kind = kind;
  }
}
