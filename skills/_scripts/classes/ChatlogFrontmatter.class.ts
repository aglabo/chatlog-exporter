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
import { stringify } from 'yaml';

// --- shared
import { reorderFrontmatterEntries } from '../libs/text/frontmatter-utils.ts';
import { toStringWithNull } from '../libs/text/string-utils.ts';

// Error
import { ChatlogError } from './ChatlogError.class.ts';

// Constants
import { FRONTMATTER_DELIMITER } from '../constants/common.constants.ts';

// --- Internal definitions
// constants
const _DEFAULT_FIELD_ORDER: string[] = [
  'title',
  'date',
  'session_id',
  'project',
  'slug',
  'type',
  'category',
  'summary',
  'topics',
  'tags',
] as const;

export class ChatlogFrontmatter {
  private _entries: Record<string, string | string[]>;

  constructor(input: string) {
    this._entries = this._parseFrontmatter(input);
  }

  private _parseFrontmatter(input: string): Record<string, string | string[]> {
    if (input === '') {
      return {};
    }
    const _body = this._extractBody(input);
    if (_body.trim() === '') {
      return {};
    }
    let _parsed: unknown;
    try {
      _parsed = parseYaml(_body);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new ChatlogError('InvalidYaml', 'YamlSyntaxError', detail);
    }
    if (_parsed === null || _parsed === undefined || typeof _parsed !== 'object' || Array.isArray(_parsed)) {
      throw new ChatlogError('InvalidFormat', 'YamlNotMapping', 'frontmatter yaml is not a mapping');
    }
    return this._toEntries(_parsed as Record<string, unknown>);
  }

  private _extractBody(input: string): string {
    const _lines = input.split('\n');
    if (_lines[0] !== FRONTMATTER_DELIMITER) {
      throw new ChatlogError('InvalidFormat', 'DoesNotStart', 'frontmatter does not start with delimiter');
    }
    const _closeIdx = _lines.indexOf(FRONTMATTER_DELIMITER, 1);
    if (_closeIdx === -1) {
      throw new ChatlogError('InvalidFormat', 'NotClosed', 'frontmatter block is not closed');
    }
    return _lines.slice(1, _closeIdx).join('\n');
  }

  private _toStringOrArray(v: unknown): string | string[] {
    if (Array.isArray(v)) {
      return v.map((item) => item instanceof Date ? item.toISOString().slice(0, 10) : toStringWithNull(item));
    }
    if (v instanceof Date) { return v.toISOString().slice(0, 10); }
    return toStringWithNull(v);
  }

  private _toEntries(parsed: Record<string, unknown>): Record<string, string | string[]> {
    const _result: Record<string, string | string[]> = {};
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

  toFrontmatter(fieldOrder: string[] = _DEFAULT_FIELD_ORDER): string {
    if (fieldOrder.length === 0) {
      throw new ChatlogError('InvalidArgs', 'IsEmpty', 'fieldOrder must not be empty');
    }
    const _ordered = reorderFrontmatterEntries(this._entries, fieldOrder);
    if (Object.keys(_ordered).length === 0) {
      return `${FRONTMATTER_DELIMITER}\n\n${FRONTMATTER_DELIMITER}\n`;
    }
    const _yamlBody = stringify(_ordered, { defaultKeyType: 'PLAIN', defaultStringType: 'QUOTE_DOUBLE', lineWidth: 0 });
    return `${FRONTMATTER_DELIMITER}\n${_yamlBody}${FRONTMATTER_DELIMITER}\n`;
  }
}
