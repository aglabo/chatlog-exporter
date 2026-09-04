# テストコード規約

## 適用範囲

`**/*.spec.ts` のすべてのテストファイル（unit / functional / integration / e2e / system）に適用する。

---

## 基本原則

### ループは `describe` 内・`it` の外に置く

`describe` は機能・シナリオのグループ化、`it` は単一ケース（1 つの振る舞いのみ検証）。
テーブル駆動のループを `it` の中に書くと、どのケースが失敗したか分からなくなる。

```typescript
// Good — ループは describe 内、it の外
describe('functionName', () => {
  for (const { input, expected } of _cases) {
    it(`[Normal] T-XX-YY-01: ${input} → ${expected}`, () => {
      assertEquals(fn(input), expected);
    });
  }
});

// Bad — it の中でループしている（どのケースが失敗したか不明）
it('all cases pass', () => {
  for (const { input, expected } of _cases) {
    assertEquals(fn(input), expected);
  }
});
```

ループで生成される `it` にも、テスト ID と入出力値をラベルに埋め込む（4 章参照）。

### fixtures は Internal Helpers に定義する

テストケース配列を `it` の中やファイルトップレベルに直書きしない。
`_cases` / `_fixtures` / `_errorCases` として Internal Helpers（2 章グループ 4）に置く。

---

## 1. ファイルヘッダ

各テストファイルの先頭には以下のヘッダを記載する。

```typescript
// src: <モジュール相対パス>/__tests__/<type>/<name>.<type>.spec.ts
// @(#): <テスト対象の短い説明>
//       対象: <テスト対象関数・クラス名>
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
```

---

## 2. import 文の構成

import はコメントで区切られた **5グループ** を決まった順序で並べる。
グループ間は **空行 1行** で区切る。グループヘッダは `// ─── <名前>` 形式（U+2500 × 3 + 半角スペース）を使う。

```typescript
// ─── BDD modules
// ─── Test target
// ─── Helpers
// ─── Internal Helpers
// ─── Tests
```

### グループ 1: BDD modules

`@std/assert` の assertion 関数、`@std/testing/bdd` の BDD 関数、モック系の順に並べる。
型 import (`import type`) が混在する場合はその直後に配置する。
型、stubはサブブロックに配置し、その上に1行コメントを付加する

```typescript
// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
// stub
import { stub } from '@std/testing/mock'; // stub/spy が必要な場合のみ
// types
import type { Stub } from '@std/testing/mock'; // 型が必要な場合のみ
```

### グループ 2: Test target

テスト対象の関数・クラス・定数を import する。
複数ある場合はテスト対象関数を先頭に、依存クラスをその後に並べる。
依存する関数、定数はサブブロックに配置し、1行コメントを付加する

```typescript
// ─── Test target
import { GlobalConfig } from '../../../../_cle-libs/classes/GlobalConfig.class.ts';
// functions
import { buildConfig } from '../../export-chatlog.ts';
```

### グループ 3: Helpers

テスト対象の動作確認に必要な補助関数・ライブラリを import する。
型、クラス、定数はサブブロックに配置し、1行コメントを付加する

```typescript
// ─── Helpers
import { normalizePath } from '../../../../_cle-libs/libs/file-io/path-utils.ts';
// constants
import { BASE_CONFIG } from '../constants/config.ts';
// types
import type { ExportConfig } from '../../types/export-config.types.ts';
import type { PeriodRange } from '../../types/filter.types.ts';
```

Helpers が不要なテストでは、このグループを省略してよい。

### グループ 4: Internal Helpers

テストファイル内でのみ使うヘルパー定数・型・関数を定義する。
`// constants` / `// types` / `// functions` のサブコメントで区別する。

```typescript
// ─── Internal Helpers

// constants
const ALL_PERIOD: PeriodRange = parsePeriod(undefined);
const BASE_CONFIG: ExportConfig = { ...DEFAULT_EXPORT_CONFIG };

// types
interface FixtureData { ... }

// functions
function _makeSession(overrides: Partial<ExportedSession> = {}): ExportedSession { ... }
async function _writeJsonl(filePath: string, lines: unknown[]): Promise<void> { ... }
```

不要なサブグループは省略してよい。Internal Helpers が一切不要なテストではグループ自体を省略してよい。

### グループ 5: Tests

`describe` ブロックを配置する。グループヘッダと `describe` の間に空行を 1行入れる。

```typescript
// ─── Tests

describe('FunctionName', () => { ... });
```

---

## 3. JSDoc の付加対象と形式

### 3-1. Internal Helpers の各シンボル

**定数**（1行 JSDoc）

```typescript
/** 期間フィルタを設定しない（全期間対象）`PeriodRange`。テスト内で期間外除外を行わない場合に使用する。 */
const ALL_PERIOD: PeriodRange = parsePeriod(undefined);
```

**クラス**（クラス本体・constructor・各メソッドの 3箇所）

```typescript
/**
 * git コマンドを実行しない `CommandProvider` モック。
 *
 * `GlobalConfig.getInstance()` に渡す `commandProvider` として使用し、
 * 実際の git rev-parse を発行せずに成功レスポンスを返す。
 */
class _NoopCommandProvider {
  /** コマンドと引数を受け取るが何も実行しない（インターフェース互換用）。 */
  constructor(_cmd: string, _opts: { args: string[] }) {}

  /** 常に `{ success: true, code: 0, stdout: 空バイト列 }` を返す。 */
  output(): Promise<...> { ... }
}
```

**関数**（`@param` / `@returns` を含む複数行 JSDoc）

```typescript
/**
 * テスト用 `GlobalConfig` インスタンスを YAML 文字列から生成する。
 *
 * 毎回 `GlobalConfig.resetInstance()` でシングルトンをリセットしてから
 * `_NoopCommandProvider` と `_existsStat` を注入して初期化する。
 *
 * @param yaml - GlobalConfig に読み込ませる YAML テキスト（例: `'agent: chatgpt'`）
 * @returns 初期化済みの `GlobalConfig` インスタンス
 */
async function _makeGlobalConfig(yaml: string): Promise<GlobalConfig> { ... }
```

**スタブ定数**（戻り値の意味を1行で説明）

```typescript
/** ファイル存在チェックを常に `true` で返すスタブ。テスト環境で `statProvider` として使用する。 */
const _existsStat = (_path: string) => Promise.resolve({ isFile: true } as Deno.FileInfo);
```

### 3-2. describe 構造とラベル規則

テストは **4階層** を基本とする。Given は省略し、機能種別 → 分類 → ケースの順で整理する。

| 階層                 | ラベル形式                                                   | JSDoc 種別 | 記載内容                                                    |
| -------------------- | ------------------------------------------------------------ | ---------- | ----------------------------------------------------------- |
| TOP（クラス/関数名） | `'ClassName'` / `'functionName'`                             | 複数行     | 対象の責務・テスト ID 範囲・`@see`                          |
| 機能種別             | `'methodName'` / `'featureName'`                             | 複数行     | 機能の責務・検証するシナリオの概要                          |
| 分類                 | `'When: 正常系'` / `'When: 異常系'` / `'When: エッジケース'` | 1行        | 分類の意味（省略可）                                        |
| ケース               | `it(...)`                                                    | —          | `[Normal]` / `[Error]` / `[Edge]` prefix + テスト ID + 説明 |

#### 分類ラベル一覧

| 分類         | `describe` ラベル      | `it` prefix |
| ------------ | ---------------------- | ----------- |
| 正常系       | `'When: 正常系'`       | `[Normal]`  |
| 異常系       | `'When: 異常系'`       | `[Error]`   |
| エッジケース | `'When: エッジケース'` | `[Edge]`    |

分類が 1 種類しかない場合は `When:` ブロックを省略して `it` を直接置いてよい。

##### TOP レベルの例

```typescript
/**
 * `GlobalConfig` クラスのユニットテストスイート。
 *
 * シングルトン取得・値参照・YAML パース・ファイル読み込みを検証する。
 *
 * テスト ID 範囲: T-CLS-GC-01 〜 T-CLS-GC-67
 *
 * @see GlobalConfig
 */
describe('GlobalConfig', () => {
```

##### 機能種別レベルの例

```typescript
/**
 * `getInstance` のシングルトン動作テスト。
 *
 * 初回取得・yaml/configFile オプション・既存インスタンスへの後続呼び出しを検証する。
 */
describe('getInstance', () => {
```

##### When / it レベルの例

```typescript
/** 引数なしまたは有効なオプションを渡す正常ケース。 */
describe('When: 正常系', () => {
  it('[Normal] T-CLS-GC-01: 2 回の getInstance は同一参照を返す', ...);
  it('[Normal] T-CLS-GC-61: yaml で chatlogsDir が設定される', ...);
});

/** 不正な入力でエラーがスローされるケース。 */
describe('When: 異常系', () => {
  it('[Error] T-CLS-GC-64: yaml が不正YAML構文 → ChatlogError(InvalidYaml)', ...);
});

/** 境界値・副作用・優先度など特殊なケース。 */
describe('When: エッジケース', () => {
  it('[Edge] T-CLS-GC-63: yaml が空文字列 → デフォルト値が使われる', ...);
  it('[Edge] T-CLS-GC-65: 既存インスタンスがある場合 yaml オプションは無視される', ...);
});
```

---

## 4. テスト ID 命名規則

テスト ID は `T-<スコープ>-<機能略語>-<連番>[-<枝番>]` の形式にする。

- `T-EC-BC-01-01`: export-chatlog / buildConfig / テスト 01 / ケース 01
- `T-EC-PA-06-02`: export-chatlog / parseArgs / テスト 06 / ケース 02

`it` のラベルには必ずテスト ID を先頭に付ける。

```typescript
it('T-EC-BC-01-01: parsed.agent=codex → result.agent === codex', () => { ... });
```

### 4-1. ID はリポジトリ全体で一意

**同一のテスト ID を 2 つ以上の `it` に割り当ててはならない。** テスト種別が違っても同様である。
ID だけでテストを一意に特定できることが、この規則の目的である。

同一対象を複数レイヤで検証する場合は、後発レイヤの prefix に種別サフィックスを付ける。

| レイヤ      | prefix                   | 例                |
| ----------- | ------------------------ | ----------------- |
| unit        | 基準（サフィックスなし） | `T-CL-LPD-03-01`  |
| integration | `I`                      | `T-CL-LPDI-03-01` |
| functional  | `F`                      | `T-CLS-CCF-40`    |

JSDoc から他ファイルのテスト ID を参照するのは構わない（例: 「基本構造は functional
テスト（`T-EC-WS-03`）でカバー済み」）。**割り当て**は `it` ラベルの ID だけを指す。

### 4-2. prefix の名前空間

prefix の第 1 セグメントはスキル、第 2 セグメント以降はテスト対象を表す。

| 名前空間  | 対象                             |
| --------- | -------------------------------- |
| `T-LIB-*` | `_cle-libs/libs/`                |
| `T-CLS-*` | `_cle-libs/classes/`             |
| `T-EC-*`  | `export-chatlogs`                |
| `T-CL-*`  | `classify-chatlogs`              |
| `T-FL-*`  | `filter-chatlogs`                |
| `T-PF-*`  | `filter-chatlogs` / noise-filter |
| `T-NC-*`  | `normalize-chatlogs`             |
| `T-SF-*`  | `set-frontmatter`                |

対象を表すセグメントは**テスト対象の関数・クラス単位**で決める。ファイル単位ではない
（1 ファイルが複数の関数を検証する場合、関数ごとに prefix を分ける）。

複数ファイルが同じ prefix を共有すること自体は禁止しない。**禁止するのは完全 ID の重複だけ**
である。共有する場合は連番帯を互いに重ねないこと。

prefix を新設する前に、下記コマンドで未使用であることを確認する。

```bash
grep -rl "T-<新prefix>-" --include=*.spec.ts .
```

### 4-3. 重複の機械検査

prefix 一覧を人手で維持する台帳は持たない。実体から導出する。

```bash
# 1) it ラベルに割り当てられた ID を抽出する
grep -rhoE 'it[(].*' --include=*.spec.ts . \
  | tr -c 'A-Za-z0-9-' '\n' \
  | grep -xE 'T-[A-Z0-9]+(-[A-Z0-9]+)*-[0-9]{2}(-[0-9]{2})?' \
  | sort > /tmp/test-ids.txt

# 抽出件数を確認する（0 件ならパイプラインが壊れている。現状の想定は約 2600 件）
wc -l < /tmp/test-ids.txt

# 2) 2 回以上割り当てられている ID を報告する
uniq -d < /tmp/test-ids.txt
```

`wc -l` が妥当な件数を示したうえで `uniq -d` の出力が空であること。
この件数は単なる目安ではなく、次の 2 つを検知するためのものなので必ず確認する。

- 0 件 → パイプラインが途中で壊れている
- 想定より極端に少ない → `grep` の結果が途中で打ち切られている
  （`rtk` 等のプロキシは大量ヒット時に出力を切り詰める。切り詰めを知らせる行は
  後段の `grep -xE` で捨てられるため、件数を見ないと気づけない）

エラーを `2>/dev/null` で握り潰すと「重複なし」と区別が付かなくなるため、
標準エラー出力は捨てないこと。
ID が報告されたら、下記で割り当て箇所を特定する。

```bash
grep -rn "<報告された ID>" --include=*.spec.ts .
```

以下の 3 点を外すと検出漏れ・誤検出を起こす。

- `it(` を含む行に限定しないと、JSDoc の相互参照を割り当てと誤認する。
  なお同一行に `it(` とコメント等で参照された別 ID が並ぶ場合は誤検出になり得る
- トークン単位（`tr -c` で分割し `grep -x`）で照合しないと、`T-EC-C` **`T-01-01`** のような
  prefix 付き ID の内部一致を prefix-less ID と誤認する
- ファイル単位で `sort -u` してから集計すると、同一ファイル内で同じ ID を 2 回割り当てた
  重複を取りこぼす。割り当ての**出現回数**を全ファイル横断で数えること

---

## 5. ファイル名

```text
<テスト対象名>.<テスト種別>.spec.ts
```

| テスト種別  | ファイル名例                               |
| ----------- | ------------------------------------------ |
| unit        | `period-filter.unit.spec.ts`               |
| functional  | `parse-claude-session.functional.spec.ts`  |
| integration | `find-claude-sessions.integration.spec.ts` |
| e2e         | `main.e2e.spec.ts`                         |
| system      | `export-chatlog.main.system.spec.ts`       |

---

## 6. 内部シンボルの命名（テストファイル固有の補足）

- Internal Helpers の関数・クラス・定数はすべて `_` プレフィックスを付ける（[naming-conventions.md](naming-conventions.md) 参照）
- テーブル駆動ケース配列も `_cases` / `_errorCases` のように `_` プレフィックスを付ける
- `beforeEach`/`afterEach` スコープの変数（`tempDir`, `globalConfig` 等）は `_` なし（ループ変数相当）
