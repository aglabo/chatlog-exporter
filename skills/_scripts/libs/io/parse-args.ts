// src: skills/_scripts/libs/io/parse-args.ts
// @(#): CLI 引数の汎用パーサー
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { ChatlogError } from '../../classes/ChatlogError.class.ts';
import { isKnownAgent } from '../../constants/agents.constants.ts';
import { normalizePath } from '../file-io/path-utils.ts';

/** 正規化後に `/` を含む場合 `true` を返す（CLI 位置引数のディレクトリパス判定）。 */
export const isDirectoryArg = (arg: string): boolean => {
  return normalizePath(arg).includes('/');
};

/**
 * CLI 引数を解析して Partial<T> を返す汎用パーサー。
 *
 * 位置引数の解釈は T が `period`/`agent`/`inputDir` を持つことを前提とする。
 * - `YYYY-MM` 形式 → `period`
 * - 既知エージェント名 → `agent`
 * - ディレクトリパス → `inputDir`
 */
export const parseArgsToConfig = <T extends { period?: string; agent?: string; inputDir?: string }>(
  args: string[],
  optKeys: Record<string, keyof T>,
  optFlags: Record<string, keyof T>,
): Partial<T> => {
  const _config: Record<string, string | boolean> = {};

  const _validKeys = new Set<string>([
    'period',
    'agent',
    'inputDir',
    ...Object.values(optKeys).map(String),
    ...Object.values(optFlags).map(String),
  ]);
  const _isValidKey = (key: string): key is keyof T & string => _validKeys.has(key);

  const _set = (key: string, value: string | boolean): void => {
    if (!_isValidKey(key)) { throw new ChatlogError('InvalidArgs', `不明なキー: ${key}`); }
    if (value === '') { throw new ChatlogError('InvalidArgs', `値が空です: ${key}`); }
    _config[key] = value;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    const _flagAttr = optFlags[arg];
    if (_flagAttr !== undefined) {
      _set(String(_flagAttr), true);
      continue;
    }

    if (arg.startsWith('--')) {
      const _eqIdx = arg.indexOf('=');
      const _hasEq = _eqIdx !== -1;
      const _key = _hasEq ? arg.slice(0, _eqIdx) : arg;
      const _value = _hasEq ? arg.slice(_eqIdx + 1) : undefined;

      const _attr = optKeys[_key];
      if (_attr !== undefined) {
        if (_hasEq) {
          _set(String(_attr), _value!);
        } else {
          if (i + 1 >= args.length) { throw new ChatlogError('InvalidArgs', `値が不足しています: ${_key}`); }
          _set(String(_attr), args[++i]);
        }
        continue;
      }

      throw new ChatlogError('InvalidArgs', `不明なオプション: ${arg}`);
    }

    // 位置パラメータ解釈
    if (/^\d{4}-\d{2}$/.test(arg) || /^\d{4}$/.test(arg)) {
      _set('period', arg);
    } else if (isKnownAgent(arg)) {
      _set('agent', arg);
    } else if (isDirectoryArg(arg)) {
      _set('inputDir', normalizePath(arg));
    } else {
      throw new ChatlogError('InvalidArgs', `不明な引数: ${arg}`);
    }
  }

  return _config as Partial<T>;
};
