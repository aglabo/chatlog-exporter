// src: skills/_scripts/classes/ChatlogFrontmatter.class.ts
// @(#): Chatlog フロントマタークラス
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// --─ Imports
// external
import { parse as parseYaml } from '@std/yaml';

// --- shared
import { divideEntry, hasFrontmatterFields, reorderFrontmatterEntries } from '../libs/text/frontmatter-utils.ts';
import { toStringWithNull } from '../libs/text/string-utils.ts';
import { stringifyFrontmatter } from '../libs/text/yaml-utils.ts';

// types
import type { FrontmatterFields } from '../types/frontmatter.types.ts';

// Error
import { ChatlogError } from './ChatlogError.class.ts';

// Constants
import { FRONTMATTER_DELIMITER } from '../constants/common.constants.ts';

// --- Internal definitions
// constants
const _DEFAULT_FIELD_ORDER: string[] = [
  'title',
  'date',
  'type',
  'category',
  'session_id',
  'project',
  'slug',
  'topics',
  'tags',
] as const;

export class ChatlogFrontmatter {
  private _entries: FrontmatterFields;

  constructor(input: string) {
    this._entries = this._parseFrontmatter(input);
  }

  private _parseFrontmatter(input: string): FrontmatterFields {
    if (input === '') { return {}; }

    // divideEntry で frontmatter テキストを取得（DoesNotStart は '' を返す、NotClosed は throw）
    let _divided: { frontmatter: string; content: string };
    try {
      _divided = divideEntry(input);
    } catch (e) {
      if (e instanceof ChatlogError) { throw e; }
      // @std/yaml が不正 YAML で throw した場合
      const detail = e instanceof Error ? e.message : String(e);
      throw new ChatlogError('InvalidYaml', 'YamlSyntaxError', detail);
    }

    // DoesNotStart の場合 divideEntry は frontmatter: '' を返すが、
    // ChatlogFrontmatter は --- で始まらない入力に DoesNotStart を throw する仕様
    if (_divided.frontmatter === '') {
      throw new ChatlogError('InvalidFormat', 'DoesNotStart', 'frontmatter does not start with delimiter');
    }

    const _yamlText = _divided.frontmatter.split('\n').slice(1, -2).join('\n');

    if (_yamlText.trim() === '') { return {}; }

    let _parsed: unknown;
    try {
      _parsed = parseYaml(_yamlText);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new ChatlogError('InvalidYaml', 'YamlSyntaxError', detail);
    }
    if (_parsed === null || _parsed === undefined || typeof _parsed !== 'object' || Array.isArray(_parsed)) {
      throw new ChatlogError('InvalidFormat', 'YamlNotMapping', 'frontmatter yaml is not a mapping');
    }
    return this._toEntries(_parsed as Record<string, unknown>);
  }

  private _toStringOrArray(v: unknown): string | string[] {
    if (Array.isArray(v)) {
      return v.map((item) => item instanceof Date ? item.toISOString().slice(0, 10) : toStringWithNull(item));
    }
    if (v instanceof Date) { return v.toISOString().slice(0, 10); }
    return toStringWithNull(v);
  }

  private _toEntries(parsed: Record<string, unknown>): FrontmatterFields {
    const _result: FrontmatterFields = {};
    for (const key of Object.keys(parsed)) {
      _result[key] = this._toStringOrArray(parsed[key]);
    }
    return _result;
  }

  get(key: string): string | string[] | undefined {
    return this._entries[key];
  }

  set(key: string, value: string | string[]): void {
    this._entries[key] = value;
  }

  remove(key: string): void {
    delete this._entries[key];
  }

  /** type / category / title / topics / tags の5フィールドがすべて充足しているか判定する。 */
  hasRequiredFields(): boolean {
    return hasFrontmatterFields(this._entries);
  }

  /** type / category / title の3フィールドがすべて充足しているか判定する。 */
  hasBaseFields(): boolean {
    return hasFrontmatterFields(this._entries, ['type', 'category', 'title']);
  }

  toFrontmatter(fieldOrder: string[] = _DEFAULT_FIELD_ORDER): string {
    if (fieldOrder.length === 0) {
      throw new ChatlogError('InvalidArgs', 'IsEmpty', 'fieldOrder must not be empty');
    }
    const _ordered = reorderFrontmatterEntries(this._entries, fieldOrder);
    if (Object.keys(_ordered).length === 0) {
      return `${FRONTMATTER_DELIMITER}\n\n${FRONTMATTER_DELIMITER}\n`;
    }
    const _yamlBody = stringifyFrontmatter(_ordered);
    return `${FRONTMATTER_DELIMITER}\n${_yamlBody}${FRONTMATTER_DELIMITER}\n`;
  }
}
