// src: scripts/testing/mutation/constants/mutation.constants.ts
// @(#): ミューテーションテストで共有する定数
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { fromFileUrl } from '@std/path';

import type { MutantStatus } from '../types/mutation.types.ts';

/** `scripts/testing/mutation/constants/` から見たリポジトリルート。元の設定 `deno.jsonc` が置かれる。 */
export const REPO_ROOT = fromFileUrl(new URL('../../../../', import.meta.url));

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
