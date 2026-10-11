---
title: "Decision Records"
status: Active
version: 1.0.0
created: "2026-10-07"
---

> This document records architectural and design decisions.
> It is non-normative and exists to preserve rationale.

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- textlint-disable ja-technical-writing/max-comma -->
<!-- markdownlint-disable no-duplicate-heading line-length  -->

---

## DR-01: 変異体を別ファイルに書き出し、一時 deno 設定で import を差し替える - 2026-10-07 18:00:38

**Phase**: req
**Status**: Accepted

### Context

当初案 (beads cle-kju.17.3) は、対象ファイルをその場で書き換えてテストし、バックアップから戻す方式だった。戻し損ねるとソースが変異したまま残る。テストは対象を相対パスで import するため、変異体を別名で置くだけではテストに届かない。

### Decision

変異体を元ファイルと同じディレクトリに `<name>.mutation-<###>.ts` として書き出す。`deno.jsonc` を元に、`imports` に「元ファイルの file URL → 変異体の file URL」を 1 件足した一時 deno 設定を作り、`deno test --config <一時設定>` で実行する。終わったら変異体と一時設定を削除する。

### Alternatives Considered

- Option A: その場で書き換えてバックアップから戻す (当初案)
- Option B: `--import-map` フラグで差し替える
- Option C: 対象モジュールを丸ごと一時ディレクトリへコピーして、その中で書き換える

### Rationale

- 2026-10-07 の実測で、一時設定の `imports` に file URL のキーを足すと、`./target.ts` を import するテストが変異体を読み、`@std/assert` 等の既存 imports も解決することを確認した
- Option B は `deno.jsonc` の `imports` を丸ごと置き換え、`@std/*` が解決できず型検査で落ちた (同日実測)
- Option C は元ソースに触れない点で同等だが、相対 import の届く範囲 (_cle-libs 等) まで毎回コピーが要る。2026-10-07 の codex レビューが同案を代替として挙げたが、上記の理由で再度却下した。元ツリーで実行することの危険は、ベースライン実行 (DR-08)・同時起動の拒否 (DR-09)・drift 検査で補う
- 変異体を同じディレクトリに置くのは、変異体の中の相対 import をそのまま解決させるため

### Consequences

- Positive:
  - 元ソースへの書き込みが発生しない。異常終了で残るのは命名規則で識別できる残骸だけになる
- Negative:
  - import 経由で読まれるコードにしか効かない (ソースを文字列で読むテストには効かない)
  - 残骸の掃除 (起動時) と `.gitignore` への追加が必要になる

---

## DR-02: 判定を 5 種にし、型検査の失敗を compile-error として分ける - 2026-10-07 18:00:38

**Phase**: req
**Status**: Accepted

### Context

`true` → `false` のように、変異によって型検査が失敗することがある。終了コードだけで判定すると、これは killed に数えられる。

### Decision

判定を `killed` / `survived` / `timeout` / `error` / `compile-error` の 5 種とする。型検査の失敗はテストプロセスの出力から識別し、`compile-error` として `killed` に数えない。

### Alternatives Considered

- Option A: 終了コードのみで判定し、型検査の失敗も killed とする
- Option B: `--no-check` で型検査を省いて実行する

### Rationale

- Option A はテストではなく型検査が検出した変異体を「テストが検出した」と数え、検出力を過大評価する
- Option B は型が壊れたコードを実行することになり、判定の意味がぶれる

### Consequences

- Positive:
  - kill 率がテストの検出力を正確に表す
- Negative:
  - 型検査の失敗を出力から識別する方法を spec で決める必要がある (Open Question)

---

## DR-03: 終了コードは既定でレポートのみ、`--strict` で未許容の生存を失敗にする - 2026-10-07 18:00:38

**Phase**: req
**Status**: Accepted

### Context

等価変異体は原理的に kill できず、cle-kju.16 でも 120 件中 5 件以上あった。生存を常に失敗にすると、道具として使えない。一方、切り分けを終えたモジュールは退行から守りたい。

### Decision

既定では、drift の検出と実行全体の失敗のときだけ非 0 で終了する。`--strict` 指定時は、それに加えて許容リストに無い survived が 1 件でもあれば非 0 で終了する。

### Alternatives Considered

- Option A: 常にレポートのみ
- Option B: 常にゲート (未許容の生存で非 0)

### Rationale

- 既定を監査の道具にしておけば、未着手のモジュールでも気軽に実行できる
- 許容リストで切り分けたモジュールだけを CI / pre-push のゲートに載せられる

### Consequences

- Positive:
  - 監査用途とゲート用途を 1 つのコマンドで両立する
- Negative:
  - `--strict` で古い許容エントリを失敗扱いにするかは未決 (Open Question)

---

## DR-04: 許容リストは行テキストと行内の出現順で変異体を識別する - 2026-10-07 18:00:38

**Phase**: req
**Status**: Accepted

### Context

ソースを編集すると行番号はずれる。一方、変異箇所のコードが変わったときは等価かどうかの判断をやり直すべきである。

### Decision

許容エントリは、ファイル・行テキスト (前後の空白を除く)・オペレータ・置換前後の字句・同一行内の出現順で変異体を識別する。どの変異体にも一致しなくなったエントリは古いエントリとして報告する。各エントリに理由を必須とする。

### Alternatives Considered

- Option A: ファイル・行番号・オペレータ・置換前後の字句で識別する
- Option C: ソースに注釈コメント (`// mutation-equivalent: <理由>`) を書く

### Rationale

- Option A は無関係な行の追加で全エントリが外れる
- Option C は本番ソースに変異テスト用の記述が混ざる
- 行テキストで識別すれば、当該行が書き換わったときだけ外れ、判断のやり直しが必要な場面と一致する

### Consequences

- Positive:
  - 行の追加・削除に追従し、判断が必要な変更だけを検出できる
- Negative:
  - 同じテキストの行が同一ファイルに複数あると区別できない (同一ファイル内で両方に一致する)
  - 行テキストが同じでも、呼び出し先や周辺条件の変更で等価性が失われることは検出しない (要件の前提として明記)

---

## DR-05: 変異体は 1 件ずつ逐次に実行する - 2026-10-07 18:00:38

**Phase**: req
**Status**: Accepted

### Context

コーディング規約は `Promise.all` による並列化を優先するが、変異体 1 件ごとに `deno test` プロセス (それ自体が `--parallel`) を起動する。

### Decision

変異体は 1 件ずつ順に実行し、その理由を実装にコメントで残す。並列実行は範囲外とする。

### Alternatives Considered

- Option A: 一定数ずつ並列に実行する

### Rationale

- テストプロセス自体が並列実行するため、外側でも並列にすると CPU とメモリを奪い合い、timeout の誤判定を招く
- DR-01 の方式は変異体ごとにファイル名が異なるため、将来並列化する余地は残る

### Consequences

- Positive:
  - 判定が実行環境の負荷に左右されにくい
- Negative:
  - 変異体数に比例して実行時間が伸びる

---

## DR-06: カバレッジ測定は本モジュールの範囲外とする - 2026-10-07 18:00:38

**Phase**: req
**Status**: Accepted

### Context

親 issue (cle-kju.17) はカバレッジ測定 (`deno task test:coverage`, T-06) も扱う。リポジトリにはカバレッジのタスクも規約も無い。

### Decision

カバレッジ測定は別モジュールで扱い、本モジュールは変異テストに限る。

### Alternatives Considered

- Option A: 本モジュールに含める

### Rationale

- 変異テストとカバレッジ測定は入出力も失敗モードも異なり、要件を分けた方が検証しやすい

### Consequences

- Positive:
  - 本モジュールの要件と受け入れ条件が変異テストに集中する
- Negative:
  - T-06 のために別モジュールの req からやり直す必要がある

---

## DR-07: テスト ID を `test_scope: MUT` に揃え、既存の `T-GM-*` を改名する - 2026-10-07 18:00:38

**Phase**: req
**Status**: Accepted

### Context

deckrd のテスト規約はテスト ID を `T-<scope>-<target>-<連番>` とし、scope はモジュールの `module.md` が宣言する。本モジュールは `test_scope: MUT` を宣言したが、実装済み T-01 の ID は `T-GM-*` (約 70 箇所) で scope を持たない。

### Decision

既存の `T-GM-*` を `T-MUT-GM-*` に改名する作業を本モジュールのタスクに含め、以降の ID も `T-MUT-*` で採番する。

### Alternatives Considered

- Option B: `scripts/` 既存の流儀 (scope なし) に合わせ、`test_scope` 宣言を見直す
- Option C: 改名は範囲外とし、新規分だけ `T-MUT-*` で採番する

### Rationale

- scope 整合性の検査 (モジュールが所有するファイルの ID はその scope で始まる) を本モジュールで成立させる
- Option C では同一モジュール内に 2 系統の ID が混在する

### Consequences

- Positive:
  - モジュールの `owns` 配下だけで ID の一意性を検査できる
- Negative:
  - 実装済みテストのラベル変更が発生する (振る舞いは変えない)

---

## DR-08: 変異前に元ソースでテストを実行し、監査が成立しない場合は失敗にする - 2026-10-07 18:30:00

**Phase**: req
**Status**: Accepted

### Context

2026-10-07 の codex レビューの指摘。元から失敗するテストや環境障害があると、すべての変異体が killed に見える。また、全件が error / timeout でも `--strict` が成功しうる。

### Decision

最初の変異体の前に元ソースのままテストを 1 回実行し、失敗または実行テスト 0 件なら中止して非 0 で終了する。`--strict` では、変異体が 1 件以上あるのに有効な判定 (killed / survived) が 0 件の場合も非 0 で終了する。

### Alternatives Considered

- Option A: ベースラインを取らず、変異体の判定だけを信じる

### Rationale

- 「テストが検出した」と「監査が成立しなかった」を区別しないと、kill 率が意味を持たない

### Consequences

- Positive:
  - kill 率と `--strict` の成功が、監査の成立を前提にしたものになる
- Negative:
  - テスト 1 回分の実行時間が増える

---

## DR-09: ロックで同時起動を拒否し、残骸の掃除はロック取得後に行う - 2026-10-07 18:30:00

**Phase**: req
**Status**: Accepted

### Context

2026-10-07 の codex レビューの指摘。起動時の残骸掃除 (REQ-F-007) は命名規則で削除対象を決めるため、2 つ目の起動が 1 つ目の使用中ファイルを消しうる。

### Decision

起動時にロックを取得し、取得できなければ何も削除せずに中止する。残骸の掃除はロック取得後にのみ行う。

### Alternatives Considered

- Option A: 実行ごとに固有の ID をファイル名に含め、自分の残骸だけを消す
- Option B: 同時起動を許し、掃除をしない

### Rationale

- Option A では強制終了した過去の実行の残骸を誰も消せない
- Option B では強制終了の残骸がソースツリーに残り続ける
- 逐次実行 (DR-05) の方針とも一致し、同時に 2 つ走らせる必要が無い

### Consequences

- Positive:
  - 掃除が他の実行を壊さない
- Negative:
  - 強制終了で残ったロックの扱いを spec で決める必要がある (Open Question)
