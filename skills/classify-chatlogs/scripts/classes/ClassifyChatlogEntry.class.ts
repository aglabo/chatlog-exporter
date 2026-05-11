// src: skills/classify-chatlogs/scripts/classes/ClassifyChatlogEntry.class.ts
// @(#): 分類用チャットログエントリクラス
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { ChatlogEntry } from '../../../_scripts/classes/ChatlogEntry.class.ts';
import { normalizePath } from '../../../_scripts/libs/path-utils/path-utils.ts';

export class ClassifyChatlogEntry extends ChatlogEntry {
  readonly filePath: string;
  readonly filename: string;

  constructor(text: string, filePath: string) {
    super(text);
    this.filePath = filePath;
    this.filename = normalizePath(filePath).split('/').pop()!;
  }
}
