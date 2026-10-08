// src: scripts/testing/mutation/constants/mutation.constants.ts
// @(#): ミューテーションテストで共有する定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { fromFileUrl, join } from '@std/path';

import { VALID_MODULES } from '../../../aplys-tester.ts';
import type { MutantStatus, MutateModule } from '../types/mutation.types.ts';

/** `scripts/testing/mutation/constants/` から見たリポジトリルート。元の設定 `deno.jsonc` が置かれる。 */
export const REPO_ROOT = fromFileUrl(new URL('../../../../', import.meta.url));

/** 実行ロックのファイルの既定パス (execution R-201)。リポジトリルート配下の `temp/mutation.lock`。 */
export const DEFAULT_LOCK_PATH = join(REPO_ROOT, 'temp', 'mutation.lock');

/** 実行ロックが既に存在して取得できないときの例外の詳細の接頭辞 (execution R-202 / DR-09)。後ろにロックファイルのパスを続ける。 */
export const LOCK_HELD_MESSAGE = '別の変異テストの実行がロックを保持しています: ';

/** 実行ロックを取得できずに中止したとき、利用者へ出すロック削除の案内 (execution R-202 / DD-07)。 */
export const LOCK_DELETE_GUIDANCE = '他の変異テストの実行が無いことを確かめてから、ロックファイルを削除してください';

/** 中止時に出す、既存ロックに記録された PID の行の見出し (execution R-202 / DD-07)。後ろに PID を続ける。 */
export const LOCK_PID_LABEL = '記録された PID: ';

/** 中止時に出す、既存ロックに記録された作成時刻の行の見出し (execution R-202 / DD-07)。後ろに記録の原文を続ける。 */
export const LOCK_CREATED_AT_LABEL = '記録された作成時刻: ';

/** 実行ロックを解放できなかったときの警告の接頭辞 (execution R-213 / DD-14)。後ろにロックファイルのパスと失敗の理由を続ける。 */
export const LOCK_RELEASE_WARNING = '実行ロックを解放できませんでした: ';

/** 変異体ファイル・一時設定を削除できなかったときの警告の接頭辞 (execution R-226 / DD-05)。後ろに削除できなかったパスを続ける。 */
export const LEFTOVER_WARNING = '変異体の後始末でファイルを削除できませんでした: ';

/** 起動時の残骸掃除で削除できなかったファイルがあるときの監査単位の失敗の理由の接頭辞 (execution DD-14)。後ろに削除できなかったパスを続ける。 */
export const SWEEP_FAILURE_MESSAGE = '起動時の残骸掃除でファイルを削除できませんでした: ';

/** レポートを書き出せなかったときの監査単位の失敗の理由の接頭辞 (execution DD-14 / report-cli R-615)。後ろに失敗の理由を続ける。 */
export const REPORT_WRITE_FAILURE_MESSAGE = 'レポートを書き出せませんでした: ';

/** ベースラインの失敗で監査を中止するときに、実行前後で内容が変わった元ソース (drift) を標準エラー出力へ列挙する見出し (execution R-208)。後ろに drift のパスを続ける。 */
export const BASELINE_ABORT_DRIFT_MESSAGE =
  'ベースラインの失敗で中止しました。実行前後で内容が変わったソースがあります: ';

/** ハッシュを取るソースファイルが存在しないときの例外の詳細の接頭辞 (execution R-212 / DD-14)。後ろにソースファイルのパスを続ける。 */
export const SOURCE_NOT_FOUND_MESSAGE = 'ハッシュを取るソースファイルが存在しません: ';

/** 報告で件数を並べる判定の順 (DR-02 の 5 種。`MutantStatus` の宣言順)。 */
export const MUTANT_STATUSES: readonly MutantStatus[] = ['killed', 'survived', 'timeout', 'error', 'compile-error'];

/** 報告で survived の内訳に添える、許容済みの件数の見出し (R-607)。 */
export const REPORT_LABEL_ALLOWED = '許容済み';

/** 報告で survived の内訳に添える、未許容の件数の見出し (R-607)。 */
export const REPORT_LABEL_UNALLOWED = '未許容';

/** 報告で内訳の行に付ける字下げ。 */
export const REPORT_INDENT = '  ';

/** 報告で kill 率 (killed ÷ (killed + survived)) の行に付ける見出し (R-608 / DD-05)。 */
export const REPORT_LABEL_KILL_RATE = 'kill 率';

/** 報告で有効判定率 ((killed + survived) ÷ 分母) の行に付ける見出し (R-608 / DD-05)。 */
export const REPORT_LABEL_EFFECTIVE_RATE = '有効判定率';

/** 報告で未許容の生存の一覧に付ける見出し (R-609)。件数を添えて `未許容の生存 (<n> 件):` と出す。 */
export const REPORT_HEADING_UNALLOWED = '未許容の生存';

/** 報告で古い許容エントリの一覧に付ける見出し (R-610)。件数を添えて `古い許容エントリ (<n> 件):` と出す。 */
export const REPORT_HEADING_STALE = '古い許容エントリ';

/** 報告で drift (実行前後で内容が変わった元ソースファイル) の一覧に付ける見出し (R-611)。件数を添えて `drift (<n> 件):` と出す。 */
export const REPORT_HEADING_DRIFT = 'drift';

/** 報告で監査単位の失敗の理由の一覧に付ける見出し (R-621 / DD-10)。件数を添えて `監査の失敗 (<n> 件):` と出す。 */
export const REPORT_HEADING_AUDIT_FAILURES = '監査の失敗';

/** 報告で変異体の置換前と置換後の字句の間に置く区切り (R-609)。 */
export const REPORT_REPLACE_ARROW = '→';

/** 報告で一覧の見出しに添える件数の単位 (R-609 / R-610 / R-611 / R-612)。`<見出し> (<n> 件):` と出す。 */
export const REPORT_COUNT_UNIT = '件';

/** 報告で残骸 (後始末で削除できなかったファイル) の一覧に付ける見出し (R-612)。件数を添えて `残骸 (<n> 件):` と出す。 */
export const REPORT_HEADING_LEFTOVERS = '残骸';

/** 報告で残骸の一覧の直前に出す警告 (R-612 / DD-07)。残骸は次回起動時の掃除で回収する (execution DD-05)。 */
export const REPORT_WARNING_LEFTOVERS = '警告: 削除できなかったファイルがあります。次回起動時の掃除で削除されます';

/** 報告で有効な判定 (killed + survived) がすべて survived のファイルに添える警告の文言 (R-613 / DD-08)。 */
export const REPORT_WARNING_INEFFECTIVE = '差し替えが効いていない可能性';

/** 報告で差し替えが効いていない可能性の警告の行頭に付ける接頭辞 (R-613 / DD-08)。 */
export const REPORT_WARNING_PREFIX = '警告: ';

/** 報告で有効な判定 (killed + survived) がすべて survived のファイルの名前の後に続ける文言 (R-613 / DD-08)。 */
export const REPORT_WARNING_ALL_SURVIVED = 'は有効な判定がすべて survived です';

/** 報告で SIGINT による中断時に出力の先頭行に出す見出し (R-605 / DD-06)。判定済みの分だけの途中結果であることを示す。 */
export const REPORT_HEADING_INTERRUPTED = '中断（途中結果）';

/** 報告で割合の分母が 0 のときに百分率の代わりに出す表記 (R-608 / Edge report-cli-14 / report-cli-27)。0 除算の `NaN` や `Infinity` を出さない。 */
export const REPORT_RATE_UNDEFINED = '算出不能';

/** 報告で生成件数が 0 のときに件数行の前に出す行 (R-606 / Edge report-cli-8)。中断で判定済みが 0 件なだけのときは出さない。 */
export const REPORT_NO_MUTANTS = '変異体 0 件';

/** 終了コード: 監査が成立し、失敗の条件に当たらない (report-cli 4.3)。 */
export const EXIT_CODE_OK = 0;

/** 終了コード: 監査が成立しない、または `--strict` の失敗条件に当たる (report-cli 4.3)。 */
export const EXIT_CODE_FAILURE = 1;

/** 終了コード: SIGINT で中断した (report-cli 4.3。128 + SIGINT の 2)。 */
export const EXIT_CODE_INTERRUPTED = 130;

/** ベースラインのテストが終了コード 0 以外で終了したときの失敗理由 (execution R-208 / DD-06)。 */
export const BASELINE_REASON_NONZERO_EXIT = 'ベースラインのテストが失敗しました (終了コードが 0 以外)';

/** ベースラインの実行で成功したテストが 1 件も無いときの失敗理由 (execution R-208 / DD-06)。 */
export const BASELINE_REASON_ZERO_PASSED = 'ベースラインで成功したテストが 1 件もありません';

/** ベースラインの出力にテスト結果の要約行が無いときの失敗理由 (execution R-208 / DD-06)。 */
export const BASELINE_REASON_NO_SUMMARY = 'ベースラインの出力にテスト結果の要約行がありません';

/** ベースラインのテストが制限時間内に終わらなかったときの失敗理由 (execution R-208 / DD-10)。 */
export const BASELINE_REASON_TIMEOUT = 'ベースラインのテストが制限時間内に終了しませんでした';

/** ベースラインのテストを起動できなかったときの失敗理由の前置き。起動失敗のメッセージを続ける (execution R-208 / DD-10)。 */
export const BASELINE_REASON_LAUNCH_ERROR = 'ベースラインのテストを起動できませんでした: ';

/** 変異テストが受け付けるモジュール短縮名 (report-cli DD-01)。aplys-tester の `VALID_MODULES` から、ソース集合を持たない `classes` と `scripts` を除く。 */
export const MUTATE_MODULES: readonly MutateModule[] = VALID_MODULES.filter(
  (m): m is MutateModule => m !== 'classes' && m !== 'scripts',
);

/** モジュール名の引数エラーの詳細に添える許可値の一覧 (report-cli R-601 / R-602)。 */
export const MUTATE_MODULES_NOTE = `許可値: ${MUTATE_MODULES.join(', ')}`;

/** `--timeout` 省略時の、変異体 1 件あたりのテストの制限時間 (秒) (report-cli R-604)。 */
export const DEFAULT_TIMEOUT_SEC = 120;

/** 位置引数のモジュール名が無いときの例外の詳細 (report-cli R-601)。 */
export const MISSING_MODULE_MESSAGE = 'モジュール名を指定してください';

/** 許可値以外のモジュール名を渡されたときの例外の詳細の接頭辞 (report-cli R-602)。後ろにモジュール名を続ける。 */
export const UNKNOWN_MODULE_MESSAGE = '不明なモジュール名: ';

/** `--timeout` の値が正の整数でないときの例外の詳細の接頭辞 (report-cli R-603)。後ろに渡された値を続ける。 */
export const INVALID_TIMEOUT_MESSAGE = '--timeout には正の整数 (秒) を指定してください: ';

/** 変異テストが読み込む元の設定 (`deno.jsonc`) のパス。一時設定はこれと同じディレクトリに置く (execution R-215)。 */
export const DENO_CONFIG_PATH = join(REPO_ROOT, 'deno.jsonc');

/** ベースラインと変異体の `deno test` に付ける権限フラグ (unit テストの実行権限に合わせる)。 */
export const MUTATION_TEST_PERMISSIONS: readonly string[] = ['--allow-read', '--allow-write', '--allow-env'];
