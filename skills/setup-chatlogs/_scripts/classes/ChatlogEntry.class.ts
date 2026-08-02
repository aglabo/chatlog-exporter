// src: skills/_scripts/classes/ChatlogEntry.class.ts
// @(#): Chatlog エントリクラス
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --─ Imports
// shared
import { getFilename } from '../libs/path-utils/path-utils.ts';
import { divideEntry } from '../libs/text/frontmatter-utils.ts';
import { normalizeLine } from '../libs/text/line-utils.ts';

// types
import type { EntryOptions } from '../types/common.types.ts';

// classes
import { ChatlogError } from './ChatlogError.class.ts';
import { ChatlogFrontmatter } from './ChatlogFrontmatter.class.ts';

/**
 * チャットログの1エントリ（frontmatter + content）を表すクラス。
 *
 * frontmatter を YAML としてパースし、content を正規化・切り詰めして保持する。
 * `renderEntry()` で frontmatter + content を結合したテキストを再生成できる。
 *
 * @see ChatlogFrontmatter
 * @see EntryOptions
 */
export class ChatlogEntry {
  /** パース済みの frontmatter。フィールドの取得・変更に使用する。 */
  readonly frontmatter: ChatlogFrontmatter;

  /** 元の frontmatter テキスト（`---` ブロック内の YAML 文字列）。 */
  readonly frontmatterText: string;

  /** 正規化済みの本文テキスト。先頭・末尾の空白を除去し、内部の連続改行を1行空きに正規化する。 */
  readonly content: string;

  /** コンストラクタに渡されたオプション。未指定時は `{}`。 */
  readonly options: EntryOptions;

  /** 入力ファイルのパス。`options.filePath` が未指定の場合は `undefined`。 */
  get filePath(): string | undefined {
    return this.options.filePath;
  }

  /** 入力ファイルのファイル名。`options.filePath` が未指定の場合は `undefined`。 */
  get filename(): string | undefined {
    return this.options.filePath !== undefined ? getFilename(this.options.filePath) : undefined;
  }

  constructor(text: string, options?: EntryOptions) {
    const { frontmatter, content } = divideEntry(text);
    this.frontmatter = new ChatlogFrontmatter(frontmatter);
    this.frontmatterText = frontmatter;
    this.options = options ?? {};
    this.content = this._normalizeContents(this._stripContent(content));
  }

  /** 先頭・末尾の空白・改行を除去し、空でなければ末尾に `\n` を付与する。 */
  private _stripContent(content: string): string {
    const _stripped = normalizeLine(content).trim();
    return _stripped === '' ? '' : _stripped + '\n';
  }

  /** 内部の3つ以上連続する改行を `\n\n`（1行空き）に正規化する。 */
  private _normalizeContents(content: string): string {
    return content.replace(/\n{3,}/g, '\n\n');
  }

  /**
   * 本文を指定文字数で切り詰めた文字列を返す。`content` プロパティ自体は変更しない。
   * 負値の場合は `ChatlogError('InvalidArgs', 'NegativeLength')` を throw する。
   *
   * @param maxLength - 切り詰め後の最大文字数（末尾改行を含む）。0 以上の整数。
   * @returns 切り詰め後の文字列。空になる場合は `''`、それ以外は末尾に `\n` を付与（合計 maxLength 以内）。
   */
  truncateContent(maxLength: number): string {
    if (maxLength < 0) {
      throw new ChatlogError('InvalidArgs', 'NegativeLength', 'maxContentLength must be >= 0');
    }
    const _truncated = this.content.trimEnd().slice(0, maxLength > 0 ? maxLength - 1 : 0);
    return _truncated === '' ? '' : _truncated + '\n';
  }

  /**
   * frontmatter と content を結合したエントリテキストを返す。
   *
   * @param fieldOrder - frontmatter に出力するフィールドの順序。未指定時は元の順序。
   * @returns `---\n...\n---\n\n<content>` 形式の文字列。content が空の場合は frontmatter のみ。
   */
  renderEntry(fieldOrder?: string[]): string {
    const _fm = this.frontmatter.toFrontmatter(fieldOrder, { addTagHashes: true });
    return this.content === '' ? _fm : `${_fm}\n${this.content}`;
  }
}
