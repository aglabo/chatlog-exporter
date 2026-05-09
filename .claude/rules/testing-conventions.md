# テストコード規約

## 適用範囲

`**/*.spec.ts` のすべてのテストファイル（unit / functional / integration / e2e / system）に適用する。

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
import { GlobalConfig } from '../../../../_scripts/classes/GlobalConfig.class.ts';
// functions
import { buildConfig } from '../../export-chatlog.ts';
```

### グループ 3: Helpers

テスト対象の動作確認に必要な補助関数・ライブラリを import する。
型、クラス、定数はサブブロックに配置し、1行コメントを付加する

```typescript
// ─── Helpers
import { normalizePath } from '../../../../_scripts/libs/file-io/path-utils.ts';
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

**TOP レベルの例**

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

**機能種別レベルの例**

```typescript
/**
 * `getInstance` のシングルトン動作テスト。
 *
 * 初回取得・yaml/configFile オプション・既存インスタンスへの後続呼び出しを検証する。
 */
describe('getInstance', () => {
```

**When / it レベルの例**

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

---

## 5. ファイル名

```
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

- Internal Helpers の関数・クラス・定数はすべて `_` プレフィックスを付ける（命名規則 参照）
- テーブル駆動ケース配列も `_cases` / `_errorCases` のように `_` プレフィックスを付ける
- `beforeEach`/`afterEach` スコープの変数（`tempDir`, `globalConfig` 等）は `_` なし（ループ変数相当）
