// src: skills/_scripts/classes/ChatlogEntry.class.ts
// @(#): Chatlog エントリクラス
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { divideEntry } from '../libs/text/frontmatter-utils.ts';
import { ChatlogFrontmatter } from './ChatlogFrontmatter.class.ts';

export class ChatlogEntry {
  readonly frontmatter: ChatlogFrontmatter;
  readonly frontmatterText: string;
  readonly content: string;

  constructor(text: string) {
    const { frontmatter, content } = divideEntry(text);
    this.frontmatter = new ChatlogFrontmatter(frontmatter);
    this.frontmatterText = frontmatter;
    this.content = this._normalizeContent(content);
  }

  private _normalizeContent(content: string): string {
    const _stripped = content.replace(/^\n+/, '').replace(/\n+$/, '');
    return _stripped === '' ? '' : _stripped + '\n';
  }

  renderEntry(fieldOrder?: string[]): string {
    const _fm = this.frontmatter.toFrontmatter(fieldOrder);
    return this.content === '' ? _fm : `${_fm}\n${this.content}`;
  }
}
