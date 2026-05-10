// src: scripts/__tests__/functional/prefilter/classify-file.functional.spec.ts
// @(#): prefilter-chatlog.ts の機能テスト
//       対象: classifyFile
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Test target
import { classifyFile } from '../../../libs/classify-file.ts';

// ─── Helpers
import { makeRepeatedContent } from '../../_helpers/chatlog-fixtures.ts';
// constants
import { PREFILTER_MIN_CONTENT_LENGTH } from '../../_helpers/constants.ts';

// ─── Tests

/**
 * `classifyFile` 関数の機能テストスイート。
 *
 * `classifyFile(filename, text)` はファイル名パターン・User ターンのノイズパターン・
 * Assistant 応答長の 3 段階でノイズを判定し、`{ isNoise, reason }` を返す。
 *
 * ## 判定優先順位
 * 1. ファイル名パターン一致 → `isNoise=true`（後段チェックをスキップ）
 * 2. User ターンがシステムタグのみ → `isNoise=true`
 * 3. Assistant 応答が短すぎる（< 100 文字）→ `isNoise=true`
 * 4. 上記いずれにも該当しない → `isNoise=false`
 *
 * テスト ID 範囲: T-PF-CL-01 〜 T-PF-CL-09
 *
 * @see classifyFile
 */
describe('classifyFile', () => {
  /**
   * 除外パターンに一致するファイル名（`say-ok-and-nothing-else.md`）と有効な内容の前提条件グループ。
   *
   * 内容に関係なく、ファイル名だけで `isNoise=true` になることを検証する。
   */
  describe('Given: "say-ok-and-nothing-else.md" と有効な内容テキスト', () => {
    /** classifyFile(filename, text) を呼び出すとき。 */
    describe('When: classifyFile(filename, text) を呼び出す', () => {
      /** isNoise=true かつ reason にファイル名パターンの説明が含まれることを検証する。 */
      describe('Then: T-PF-CL-01 - isNoise=true が返される', () => {
        it('T-PF-CL-01-01: isNoise が true になる', () => {
          const { isNoise } = classifyFile(
            'say-ok-and-nothing-else.md',
            makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH),
          );

          assertEquals(isNoise, true);
        });

        it('T-PF-CL-01-02: reason に "ファイル名パターン:" が含まれる', () => {
          const { reason } = classifyFile(
            'say-ok-and-nothing-else.md',
            makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH),
          );

          assertEquals(reason.includes('ファイル名パターン:'), true);
        });
      });
    });
  });

  /**
   * 通常ファイル名かつ User ターンが `<system-reminder>` タグのみの前提条件グループ。
   *
   * 有意な User 発話がなく、`isNoise=true` になることを検証する。
   */
  describe('Given: 通常ファイル名 + <system-reminder> のみの User ターン', () => {
    /** classifyFile(filename, text) を呼び出すとき。 */
    describe('When: classifyFile(filename, text) を呼び出す', () => {
      /** isNoise=true が返されることを検証する。 */
      describe('Then: T-PF-CL-02 - isNoise=true が返される', () => {
        it('T-PF-CL-02-01: isNoise が true になる', () => {
          const text = '### User\n<system-reminder>システムメッセージ</system-reminder>\n\n### Assistant\n'
            + 'a'.repeat(200) + '\n';
          const { isNoise } = classifyFile('normal-file.md', text);

          assertEquals(isNoise, true);
        });
      });
    });
  });

  /**
   * 通常ファイル名 + 正常 User ターン + 30 文字の短い Assistant ターンの前提条件グループ。
   *
   * Assistant 応答が 100 文字未満のため `isNoise=true` になることを検証する。
   */
  describe('Given: 通常ファイル名 + 1 件 User ターン + 30 文字の Assistant ターン', () => {
    /** classifyFile(filename, text) を呼び出すとき。 */
    describe('When: classifyFile(filename, text) を呼び出す', () => {
      /** isNoise=true かつ reason に「短すぎる」が含まれることを検証する。 */
      describe('Then: T-PF-CL-03 - isNoise=true が返される', () => {
        it('T-PF-CL-03-01: isNoise が true になる', () => {
          const text = '### User\n' + 'u'.repeat(200) + '\n\n### Assistant\n短い\n';
          const { isNoise } = classifyFile('normal-file.md', text);

          assertEquals(isNoise, true);
        });

        it('T-PF-CL-03-02: reason に "短すぎる" が含まれる', () => {
          const text = '### User\n' + 'u'.repeat(200) + '\n\n### Assistant\n短い\n';
          const { reason } = classifyFile('normal-file.md', text);

          assertEquals(reason.includes('短すぎる'), true);
        });
      });
    });
  });

  /**
   * 通常ファイル名 + 十分な長さの User/Assistant ターンの前提条件グループ。
   *
   * すべての除外条件に該当せず、`isNoise=false` になることを検証する。
   */
  describe('Given: 通常ファイル名 + 十分な User/Assistant ターン', () => {
    /** classifyFile(filename, text) を呼び出すとき。 */
    describe('When: classifyFile(filename, text) を呼び出す', () => {
      /** isNoise=false かつ reason が空文字列であることを検証する。 */
      describe('Then: T-PF-CL-04 - isNoise=false が返される', () => {
        it('T-PF-CL-04-01: isNoise が false になる', () => {
          const { isNoise } = classifyFile('valid-chat.md', makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH));

          assertEquals(isNoise, false);
        });

        it('T-PF-CL-04-02: reason が空文字列になる', () => {
          const { reason } = classifyFile('valid-chat.md', makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH));

          assertEquals(reason, '');
        });
      });
    });
  });

  /**
   * frontmatter あり・本文が正常な会話の前提条件グループ。
   *
   * `ChatlogEntry` が frontmatter を除いた content のみを会話解析に渡すため、
   * frontmatter の内容に関わらず `isNoise=false` になることを検証する。
   */
  describe('Given: frontmatter 付きの通常会話テキスト', () => {
    /** classifyFile(filename, text) を呼び出すとき。 */
    describe('When: classifyFile(filename, text) を呼び出す', () => {
      /** frontmatter は会話解析対象外のため isNoise=false であることを検証する。 */
      describe('Then: T-PF-CL-05 - isNoise=false が返される（frontmatter は会話解析対象外）', () => {
        it('T-PF-CL-05-01: isNoise が false になる', () => {
          const text = [
            '---',
            'title: テスト会話',
            'date: 2026-01-01',
            '---',
            '',
            makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH),
          ].join('\n');
          const { isNoise } = classifyFile('valid-chat.md', text);

          assertEquals(isNoise, false);
        });
      });
    });
  });

  /**
   * frontmatter の閉じ区切りがない不正フォーマットの前提条件グループ。
   *
   * `classifyFile` が `ChatlogEntry` の `InvalidFormat` エラーをキャッチし、
   * エラーをスローせず安全に処理することを検証する。
   */
  describe('Given: frontmatter の閉じ区切りがない不正フォーマットテキスト', () => {
    /** classifyFile(filename, text) を呼び出すとき。 */
    describe('When: classifyFile(filename, text) を呼び出す', () => {
      /** エラーをスローせず isNoise=false が返されることを検証する。 */
      describe('Then: T-PF-CL-07 - エラーをスローせず isNoise=false が返される', () => {
        it('T-PF-CL-07-01: エラーをスローしない', () => {
          const text = [
            '---',
            'title: 不正フォーマット',
            makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH),
          ].join('\n');
          let threw = false;
          try {
            classifyFile('malformed.md', text);
          } catch {
            threw = true;
          }

          assertEquals(threw, false);
        });

        it('T-PF-CL-07-02: isNoise が false になる（削除対象にしない）', () => {
          const text = [
            '---',
            'title: 不正フォーマット',
            makeRepeatedContent(PREFILTER_MIN_CONTENT_LENGTH),
          ].join('\n');
          const { isNoise } = classifyFile('malformed.md', text);

          assertEquals(isNoise, false);
        });
      });
    });
  });

  /**
   * frontmatter あり・本文がノイズ会話の前提条件グループ。
   *
   * `ChatlogEntry` が frontmatter を除いた content を渡すため、
   * ノイズパターンが content から正しく検出されることを検証する。
   */
  describe('Given: frontmatter 付きのノイズ会話テキスト', () => {
    /** classifyFile(filename, text) を呼び出すとき。 */
    describe('When: classifyFile(filename, text) を呼び出す', () => {
      /** isNoise=true かつ reason が空でないことを検証する。 */
      describe('Then: T-PF-CL-08 - isNoise=true が返される', () => {
        it('T-PF-CL-08-01: isNoise が true になる', () => {
          const text = [
            '---',
            'title: ノイズ会話',
            '---',
            '',
            '### User',
            '=== GIT LOGS ===\ngit log --oneline',
            '',
            '### Assistant',
            '了解',
            '',
          ].join('\n');
          const { isNoise } = classifyFile('noise-chat.md', text);

          assertEquals(isNoise, true);
        });
      });
    });
  });

  /**
   * ファイル名が除外パターン一致かつ User がシステムタグのみの前提条件グループ。
   *
   * ファイル名チェックが最優先で評価され、User コンテンツチェックに到達しないことを検証する。
   */
  describe('Given: ファイル名が除外パターン一致 かつ User がシステムタグのみ', () => {
    /** classifyFile(filename, text) を呼び出すとき。 */
    describe('When: classifyFile(filename, text) を呼び出す', () => {
      /** reason がファイル名パターンの説明のみを含み、User チェックの reason ではないことを検証する。 */
      describe('Then: T-PF-CL-06 - reason が "ファイル名パターン:" のみを含む', () => {
        it('T-PF-CL-06-01: reason が "ファイル名パターン:" を含む（checkUserContent の reason ではない）', () => {
          const text = '### User\n<system-reminder>msg</system-reminder>\n\n### Assistant\n'
            + 'a'.repeat(200) + '\n';
          const { reason } = classifyFile('say-ok-and-nothing-else.md', text);

          assertEquals(reason.includes('ファイル名パターン:'), true);
        });
      });
    });
  });
});
