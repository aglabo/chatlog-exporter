import { ERROR_KIND_LABELS } from '../constants/chatlog-error.constants.ts';

export type ErrorKind = keyof typeof ERROR_KIND_LABELS;
