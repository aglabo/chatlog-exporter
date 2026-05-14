// src: skills/_scripts/classes/ChatlogFrontmatter.class.ts
// @(#): Chatlog フロントマタークラス
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { parse as parseYaml } from '@std/yaml';
import { FRONTMATTER_DELIMITER } from '../constants/common.constants.ts';
import { escapeString, toStringWithNull } from '../libs/text/string-utils.ts';
import { ChatlogError } from './ChatlogError.class.ts';

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
];

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
      throw new ChatlogError('InvalidYaml', 'FrontmatterYaml', detail);
    }
    if (_parsed === null || _parsed === undefined || typeof _parsed !== 'object' || Array.isArray(_parsed)) {
      throw new ChatlogError('InvalidFormat', 'FrontmatterYaml', 'frontmatter yaml is not a mapping');
    }
    return this._toEntries(_parsed as Record<string, unknown>);
  }

  private _extractBody(input: string): string {
    const _lines = input.split('\n');
    if (_lines[0] !== FRONTMATTER_DELIMITER) {
      throw new ChatlogError('InvalidFormat', 'Delimiter', 'frontmatter does not start with delimiter');
    }
    const _closeIdx = _lines.indexOf(FRONTMATTER_DELIMITER, 1);
    if (_closeIdx === -1) {
      throw new ChatlogError('InvalidFormat', 'Delimiter', 'frontmatter block is not closed');
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
      throw new ChatlogError('InvalidArgs', 'FieldOrder', 'fieldOrder must not be empty');
    }
    const _lines: string[] = [FRONTMATTER_DELIMITER];
    const _seen = new Set<string>();
    for (const field of fieldOrder) {
      if (_seen.has(field)) { continue; }
      _seen.add(field);
      const value = this._entries[field];
      if (value === undefined) { continue; }
      if (typeof value === 'string') {
        if (value === '') { continue; }
        _lines.push(`${field}: "${escapeString(value)}"`);
      } else {
        if (value.length === 0) { continue; }
        _lines.push(`${field}:`);
        for (const item of value) {
          _lines.push(`  - "${escapeString(item)}"`);
        }
      }
    }
    if (_lines.length === 1) {
      _lines.push('');
    }
    _lines.push(FRONTMATTER_DELIMITER);
    return _lines.join('\n') + '\n';
  }
}
