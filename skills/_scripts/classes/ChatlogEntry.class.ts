// src: skills/_scripts/classes/ChatlogEntry.class.ts
// @(#): Chatlog エントリクラス
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { FRONTMATTER_DELIMITER } from '../constants/common.constants.ts';
import { normalizeLine } from '../libs/text/line-utils.ts';
import { ChatlogError } from './ChatlogError.class.ts';
import { ChatlogFrontmatter } from './ChatlogFrontmatter.class.ts';

export class ChatlogEntry {
  readonly frontmatter: ChatlogFrontmatter;
  readonly frontmatterText: string;
  readonly content: string;

  constructor(text: string) {
    const { frontmatter, content } = this._divideEntry(text);
    this.frontmatter = new ChatlogFrontmatter(frontmatter);
    this.frontmatterText = frontmatter;
    this.content = content;
  }

  private _normalizeContent(content: string): string {
    const _stripped = content.replace(/^\n+/, '').replace(/\n+$/, '');
    return _stripped === '' ? '' : _stripped + '\n';
  }

  private _divideEntry(text: string): { frontmatter: string; content: string } {
    const _lines = normalizeLine(text).split('\n');

    if (_lines[0] !== FRONTMATTER_DELIMITER) {
      return { frontmatter: '', content: this._normalizeContent(_lines.join('\n')) };
    }
    const _closeIdx = _lines.indexOf(FRONTMATTER_DELIMITER, 1);
    if (_closeIdx === -1) {
      throw new ChatlogError('InvalidFormat', 'Frontmatter', 'frontmatter block is not closed');
    }
    if (_closeIdx === _lines.length - 1) {
      return { frontmatter: '', content: this._normalizeContent(_lines.join('\n')) };
    }

    return {
      frontmatter: _lines.slice(0, _closeIdx + 1).join('\n') + '\n',
      content: this._normalizeContent(_lines.slice(_closeIdx + 1).join('\n')),
    };
  }

  renderEntry(fieldOrder?: string[]): string {
    const _fm = this.frontmatter.toFrontmatter(fieldOrder);
    return this.content === '' ? _fm : `${_fm}\n${this.content}`;
  }
}
