---
title: "Implementation Plan: mutation testing harness"
based-on: specifications-index.md v1.2.0
status: Draft
version: 1.6.0
created: "2026-10-07"
---

## 1. Overview

### 1.1 Purpose

対象モジュールのソースに変異を 1 件ずつ入れて既存の unit テストを実行し、テストが変異を検出できるかを測る監査ツール (mutation testing harness) を実装する。
変異体の生成 (`generateMutants`) は T-01 で実装済みである。本計画は、残りの 10 単位 (U1〜U11 のうち生成を除く部分) を 18 コミットで実装する。

- Phase 1: 純粋な部品 (型・対象解決・ステージング・判定・許容リスト・レポート・終了コード)
- Phase 2: 実行と安全装置 (テスト実行・ロック・掃除・drift・ベースライン・逐次ランナー)
- Phase 3: CLI 統合 (引数解釈・main の順序制御・SIGINT・タスク登録・差し替えの integration 検証)

振る舞いを追加・変更するコミットは、テストと実装を同梱する (BDD)。
振る舞いを持たないコミットは対象外とし、各コミットに検証方法を記す。該当するのは Commit 1 (ID の改称のみ)、Commit 2 (型のみ)、Commit 17 (設定と文書のみ) である。

### 1.2 Reference

- Prior art:
  - cle-kju.16 の使い捨て PoC (scratchpad、消失済み): normalize-chatlogs の 120 変異体で生存率 19% → テスト修正後 6%、drift 0。元ファイルを書き換えて戻す方式は DR-01 (別ファイル + 一時設定の imports) に置き換えて却下済み
  - `.local/deckrd/temp/tasks/run-mutants-request.md`: T-03 の仕様前の草案。compile-error・ベースライン・ロックを欠き、テスト ID が `T-RM` のため `T-MUT-*` に改める
  - 実装済み: `scripts/testing/mutation/generate-mutants.ts` (T-01、beads cle-kju.17.1、commit 67c940a82)
- Specifications:
  - `docs/.deckrd/testing/mutation/specifications/specifications-index.md` (全体順序・要件対応・未決事項)
  - `specifications-generation.md` (R-101〜R-112)
  - `specifications-execution.md` (R-201〜R-228)
  - `specifications-allowlist.md` (R-501〜R-510)
  - `specifications-report-cli.md` (R-601〜R-620)
- Decision Records: DR-01 (別ファイル + 一時設定)、DR-02 (5 種の判定)、DR-03 (既定はレポートのみ、`--strict` で失敗)、DR-04 (許容リストの照合キー)、DR-05 (逐次実行)、DR-06 (カバレッジは範囲外)、DR-07 (テスト ID を `MUT` に揃える)、DR-08 (ベースライン)、DR-09 (ロックと掃除の順序)
- beads: epic cle-kju.17 (T-02〜T-08)。T-06 カバレッジは DR-06 により本計画の範囲外。requirements v1.1.0 への追記は cle-kju.17.9 で追跡する
- GitHub: #515 (当初紐付けた #478 はクローズ済みの llama-server ガイドで誤りだったため、2026-10-08 に張り替え済み)

### 1.3 テストレイヤの語彙

- unit: 注入した `TestRunnerProvider` と一時ディレクトリで検証する。実プロセスは起動しない
- integration: 実際の `deno test` を起動して検証する。Commit 18 と、実プロセスが必要な Commit 10 の一部に限る
- 新規のテスト ID は `T-MUT-<abbrev>-NN-NN` (グループ番号 + ケース番号) とする。integration は abbrev に `I` を付ける (例: `T-MUT-MTI-01-01`)
- 既存の GM だけは改称前の構造を保ち、`T-MUT-GM-01-NN-NN` の 3 段とする (Commit 1 は接頭辞の付け替えのみで番号を変えない)。`scripts/check-test-ids.ts` は 2 段・3 段の両方を受理する
- 2 つのコミットで共有する abbrev (AL / RP / RS / MT) は、コミットごとにグループ番号の帯を分けて重ねない (`docs/rules/testing-conventions.md` §4-2)。帯は tasks.md で割り当てる
- abbrev は次のとおり (module.md の略称表へ Commit 1 で登録する)

| abbrev | 対象                                   | 導入     |
| ------ | -------------------------------------- | -------- |
| GM     | generate-mutants                       | 既存     |
| RT     | resolve-targets                        | C3       |
| SM     | stage-mutant                           | C4       |
| CO     | classify-outcome                       | C5       |
| AL     | allowlist                              | C6, C7   |
| RP     | report (formatReport / decideExitCode) | C8, C9   |
| RD     | run-deno-test                          | C10      |
| RS     | run-safety                             | C11, C12 |
| BL     | baseline                               | C13      |
| RM     | run-mutants                            | C14      |
| MT     | mutate-tester (CLI / main)             | C15, C16 |

本計画では、次の 2 語を区別して使う。

- 残骸ファイル (残骸): 削除できずに残った変異体ファイルまたは一時設定。レポートの R-612 で列挙する
- 残留プロセス: 終了させられずに残った子孫プロセス。検出も報告もしない (範囲外。3.4 の execution OQ #4)

### 1.4 Phase の依存関係

```text
Phase 1 (純粋な部品)
  C1 --> C2 --+--> C3 (RT)
              +--> C4 (SM)
              +--> C5 (CO) ------------+
                                       |
              C6 (AL load) --> C7 (AL match) --> C8 (RP format) --> C9 (RP exit)
                                       |
Phase 2 (実行と安全装置)               v
  C10 (RD) --> C11 (RS lock) --> C12 (RS sweep/hash/drift) --> C13 (BL) --> C14 (RM)
                                                                              |
Phase 3 (CLI 統合)                                                            v
  C15 (parse args) --> C16 (main + SIGINT) --> C17 (task + owns) --> C18 (integration)
```

C3 / C4 / C5 は C2 の型にのみ依存し、互いに独立である。C14 は C3〜C5 (ステージング・判定)、C10 (実行)、C12 (掃除・ハッシュ)、C13 (ベースライン) に依存する。

---

## 2. Implementation Plan

### Phase 1: 純粋な部品

プロセス起動とファイル書き込みを伴わない単位 (U1, U2, U3, U5, U9, U10) を実装する。読み取りのみの副作用を除き、unit テストだけで完結する。

#### Commit 1: `test(mutation): rename T-GM-* to T-MUT-GM-*`

**参照**: REQ-C-004、DR-07、`specifications-index.md` (Section 2.6 DR-07)、`specifications-generation.md` R-106〜R-112 (既存実装の ID 改称のみ)

**変更**:

- `generate-mutants.unit.spec.ts` の約 70 件の `T-GM-*` を `T-MUT-GM-*` に改称する。テストの中身は変更しない
- `docs/rules/testing-conventions.md` §4-2 の名前空間表に `MUT` を登録する
- `module.md` の略称表に GM を維持したまま RT / SM / CO / AL / RP / RD / RS / BL / RM / MT を追加する
- `scripts/check-test-ids.ts` が改称後に重複を検出しないことを確認する (T-07 / cle-kju.17.7 との重複範囲は beads に記録する)
- 改称前後でテスト件数が同じであることを `deno task test:module unit scripts` で確認する

#### Commit 2: `feat(mutation/types): add verdict, outcome and allowlist types`

**参照**: DR-02、`specifications-execution.md` Section 3 (入出力) と impl-note、`specifications-allowlist.md` Section 3.1、`specifications-report-cli.md` Section 3.1

**変更**:

- `types/mutation.types.ts` に `MutantStatus` (`'killed' | 'survived' | 'timeout' | 'error' | 'compile-error'`) を追加する
- `TestRunOutcome` を `exited { code, stdout, stderr } | timeout | error { message }` の判別共用体で追加する。execution 仕様の impl-note は `exited { code, output }` だが、本計画は stdout と stderr を分けて保持し、判定時に連結する (DD-03 の「両方を判定に使う」を満たす。Commit 5)
- `MutantResult`、`TestRunnerProvider`、`AllowlistEntry`、`AllowlistMatch`、`BaselineResult` (`ok | failed { reason } | interrupted`) を追加する
- レポートの入力型 `MutationRunReport` は Commit 8 で追加する。execution 仕様の impl-note にある `runMutants` の戻り値 `MutationRunReport { results, drift, leftovers }` は採らない。drift は main が突合し、`runMutants` は `{ results, leftovers, interrupted }` を返す (Commit 14)
- 型は `_cle-libs/` ではなく `scripts/testing/mutation/types/` に置く (本モジュール固有のため)。`any` は使わない
- 型のみのコミットであり、`deno check` で検証する。実行時の振る舞いは無いためテスト ID は採番しない

#### Commit 3: `feat(mutation): resolve mutation targets from module name`

**参照**: REQ-F-012 (対象解決)、`specifications-generation.md` R-101〜R-105、DD-01〜DD-03、DD-06、DD-07

**変更**:

- `resolve-targets.ts` に `resolveTargets(module): { sources, tests }` を追加する (抽象: 検査済みの短縮名のみ受け取る)
- ソース集合のディレクトリは `aplys-tester.ts` の別名表から導く (libs → `skills/_cle-libs`、スキル別名 → `skills/<正式名>`)。別名表を複製しない
- 現状の `aplys-tester.ts` で export されているのはテスト用 glob の `MODULE_GLOB_TABLE` と `VALID_MODULES` だけで、ソースディレクトリの導出に要るスキル別名表 `_SKILL_MODULES` は非公開である。本コミットで `_SKILL_MODULES` を `SKILL_MODULES` として export する (aplys-tester 側の参照も改名する)。libs の 1 件は `resolve-targets.ts` に対応を持つ
- 受け付ける短縮名は `VALID_MODULES` から `classes` と `scripts` を除いた 6 件とする (`all` は元から含まれない)。`scripts` は開発用スクリプトとハーネス自身を含むため変異させない (仕様 v1.1.0、user 決定)。引数の検査は Commit 15 が行う
- テスト集合は既存の glob 生成関数を使い、当該モジュールの unit テストのみとする
- 除外: `__tests__/` 配下、`*.spec.ts(x)`、`*.types.ts(x)`、`*.constants.ts(x)`、変異体・一時設定の命名 (`<stem>.mutation-<NNN>.<ext>`、`deno.mutation-<NNN>.json`)。結果は昇順に並べる
- 命名の判定関数をここで定義し、Commit 4 の命名生成と Commit 12 の掃除から再利用する
- テスト (abbrev RT): 6 モジュールの解決、各除外規則、残骸の除外、空集合でエラーにならないこと、決定的な順序

#### Commit 4: `feat(mutation): stage mutant file and mutation config`

**参照**: REQ-F-003、REQ-NF-004、REQ-C-002、REQ-C-005、`specifications-execution.md` R-214〜R-216、DD-01、DD-02、DD-09

**変更**:

- `stage-mutant.ts` に `applyMutant(source, mutant)` を追加する。指定位置に置換前の字句が無ければ、例外を投げず error 結果を返す (R-214)。CRLF を保つ
- `toMutantPath(filePath, index)` (`<stem>.mutation-<NNN>.<ext>`、3 桁ゼロ埋め、1000 以上は桁をそのまま) と `toMutationConfigPath(index)` (元の設定と同じディレクトリの `deno.mutation-<NNN>.json`) を追加する。Commit 3 の命名判定と往復一致をテストで固定する
- `buildMutationConfig(baseConfig, originalUrl, mutantUrl)` は元の全キーを保ち、`imports` に file URL の対応を 1 件だけ足す。`--import-map` は使わない
- `deno.jsonc` を `@std/jsonc` で読み、`deno.jsonc` の `imports` に `@std/jsonc` を追加する (REQ-C-001 が許容する依存)
- `.gitignore` の許可リスト行の後ろに `*.mutation-*.ts`、`*.mutation-*.tsx`、`deno.mutation-*.json`、`temp/mutation.lock` を明示的に除外する (REQ-C-005)
- テスト (abbrev SM): 位置不一致、CRLF の保持、`.tsx`、1000 以上の番号、`imports` の追加と既存キーの保持

#### Commit 5: `feat(mutation): classify test outcome into five verdicts`

**参照**: REQ-F-004、DR-02、`specifications-execution.md` R-220〜R-224、DD-03、DD-12

**変更**:

- `classify-outcome.ts` に `stripAnsi` を追加する (ANSI エスケープの除去)
- `parseSummary` を追加する。deno の要約行から passed / failed の件数を取り出し、要約行が無ければ未検出として返す。Commit 13 のベースライン判定からも再利用する
- `classifyOutcome(outcome): MutantStatus` を純関数として追加する。終了 0 は survived、行頭 `error: Type checking failed` は compile-error、要約行で失敗を確認できれば killed、timeout は timeout、確認できない非 0 終了と error は error
- 行頭以外に現れる `Type checking failed` を compile-error にしないこと、非 0 で出力が空なら error になることをテストで固定する
- テスト (abbrev CO): 表駆動で 5 判定、ANSI 付き出力、stdout と stderr の連結、境界ケース (DD-12)

#### Commit 6: `feat(mutation): load and validate allowlist`

**参照**: REQ-F-015、REQ-F-009 (存在しない場合)、`specifications-allowlist.md` R-501〜R-505、DD-04、DD-05、Section 7 の既定値 (本計画 3.4 参照)

**変更**:

- `allowlist.ts` に `loadAllowlist(module)` を追加する。`scripts/testing/mutation/allowlist/<module>.yaml` を `@std/yaml` で読む
- ファイルが無ければエントリ 0 件 (R-501)。内容が空 (本文なし・コメントのみ) も 0 件。YAML として解釈できなければ読み込みエラー (R-502)
- 全エントリを検証してエラーをすべて集める (R-503〜R-505)。理由が欠落・空・空白のみ、`occurrence` が 1 以上の整数でない、`op` が `MutationOp` に無い、`file` / `lineText` / `before` が文字列でない、`after` が文字列でない (空文字は許可)、`file` が `/` 区切りのリポジトリルート相対でない、キーの重複
- 1 件でもエラーがあれば `ChatlogError` を投げ、全エラーを列挙する。副作用 (ロック・掃除) の前に呼ばれることを main 側で保証する (Commit 16)
- テスト (abbrev AL): ファイルなし、空文書、解釈不能、各検証項目、複数エラーの一括報告

#### Commit 7: `feat(mutation): match survivors against allowlist and extract stale entries`

**参照**: REQ-F-009、REQ-F-010、DR-04、`specifications-allowlist.md` R-506〜R-510、DD-01〜DD-03、DD-06、DD-07

**変更**:

- `matchAllowlist(mutants, results, entries)` を追加し、`{ allowed, unallowed, stale }` を返す
- 照合キーは `file` + 前後の空白を除いた `lineText` + `op` + `before` + `after` + `occurrence` (同一行で置換前の字句が同じ適用箇所を左から数えた順位)
- 照合は次の 2 つを区別する
  - 生存の許容判定 (R-506〜R-508): survived の変異体だけが対象。キーが一致するすべての変異体に一致する (DR-04 の既知の弱点を仕様どおりテストで固定する)
  - エントリの存在確認 (R-509): 判定の種類を問わず、生成された全変異体が対象。R-506 の「survived 以外は照合しない」はこちらには及ばない
- 古いエントリは、存在確認で生成された全変異体のどれにも一致しないもの (R-509)。変異体 0 件なら有効なエントリはすべて古いエントリになる
- 前提: `results` の変異体はすべて `mutants` に含まれる (全属性の値で照らし合わせる)。含まれない判定が 1 件でもあれば、照合せずに `ChatlogError` を投げる。出現順は `mutants` から求めるため、含まれない変異体を照合すると出現順 1 として黙って一致し、`allowed` と `stale` が同時に立ちうる (cle-kju.17.2.2)
- テスト (abbrev AL): 行番号のずれ、前後の空白の変化、行内の空白の変化、出現順、同テキスト行の複数一致、survived 以外にだけ一致するエントリ

#### Commit 8: `feat(mutation): format mutation report`

**参照**: REQ-F-011、REQ-F-018、DD-02 (report-cli)、DD-05、DD-07、DD-08、`specifications-report-cli.md` R-605〜R-613

**変更**:

- `report.ts` に `formatReport(summary): string` を純関数として追加する。標準出力に出すテキストのみを返す
- 内容: 中断の見出し (R-605)、変異体 0 件の明示 (R-606)、判定ごとの件数と survived の許容済み / 未許容の内訳 (R-607)、kill 率 killed ÷ (killed + survived) または「算出不能」と有効判定率 (R-608)
- 未許容の生存の一覧 (ファイル・行・桁の昇順)、古いエントリ、drift (R-609〜R-611)。残骸は存在するときだけセクションを出す (R-612)。有効判定がすべて survived のファイルの警告 (R-613)
- `summary` の入力型 `MutationRunReport` を `types/mutation.types.ts` に追加する。入力は生成件数 (`generatedCount`) と判定の列 (判定済み件数) を別に持つ
- 「変異体 0 件」(R-606) は生成件数が 0 のときだけ出す。中断で判定済みが 0 件でも、生成件数が 1 以上なら R-606 にしない
- 有効判定率 (R-608) の分母「変異体の総数」は、通常は生成件数とする。中断時は R-605 (判定済みの変異体だけで構成する) に従い、判定済み件数とする
- テスト (abbrev RP): 表駆動で各セクション、0 件・算出不能・compile-error を分母に含めないこと、中断時に判定済み 0 件でも「変異体 0 件」と出さないこと、中断時の有効判定率の分母、並び順、同一入力で同一出力

#### Commit 9: `feat(mutation): decide exit code for default and strict modes`

**参照**: REQ-F-013、REQ-F-014、REQ-F-018、DR-03、DR-08、`specifications-report-cli.md` R-614〜R-620、DD-04、DD-09

**変更**:

- `report.ts` に `decideExitCode(summary, strict): number` を純関数として追加する
- 評価順は固定する。中断は 130 を最優先 (R-614)。drift・監査単位の失敗は非 0 (1) (R-615)。既定は 0 (R-616)
- `--strict` では、未許容の生存、変異体が 1 件以上あるのに有効判定が 0 件、古いエントリのいずれかで非 0 (R-617〜R-619)。変異体 0 件では R-618 を適用しない
- 残骸・警告・変異体単位の error / timeout / compile-error は既定の終了コードに影響させない
- テスト (abbrev RP): 表駆動で優先順位 (中断 + drift)、既定と strict の差、境界 (変異体 0 件 + 古いエントリ)、レポートの数値との一貫性

### Phase 2: 実行と安全装置

プロセスとファイルシステムの副作用を持つ単位 (U4, U6, U7, U8) を実装する。unit は注入した `TestRunnerProvider` と一時ディレクトリで検証し、実際の `deno` が必要な箇所だけ integration とする。

#### Commit 10: `feat(mutation): run deno test with timeout and captured output`

**参照**: REQ-F-004、REQ-NF-002、REQ-NF-003、`specifications-execution.md` R-217〜R-219、DD-04

**変更**:

- `run-deno-test.ts` に `runDenoTest(args, { timeoutMs, signal }): Promise<TestRunOutcome>` を追加する
- stdout と stderr を捕捉する (捨てない)。制限時間を超えたら直接の子プロセスを強制終了して timeout を返す。子孫プロセスの終了は保証しない (DD-04)
- 起動失敗は error として返す。`signal` が中止されたら実行中の子プロセスを終了させる (Commit 14 の SIGINT 対応が使う)
- 既定の `TestRunnerProvider` として `runDenoTest` を公開する。`CommandProvider` (build-ledger.ts) は stderr とシグナルを持たないため流用せず、型は Commit 2 の `TestRunnerProvider` を使う
- テスト (abbrev RD): unit は終了コードと出力の捕捉・timeout・起動失敗を注入で検証する。実 `deno` が要る timeout の強制終了だけ integration (abbrev RDI) とする

#### Commit 11: `feat(mutation): acquire and release run lock`

**参照**: REQ-F-017、DR-09、`specifications-execution.md` R-201〜R-203、R-213、DD-07、DD-13、DD-14

**変更**:

- `run-safety.ts` に `acquireLock(path)` を追加する。`temp/mutation.lock` を `createNew` で排他作成し、PID・作成時刻・実行ごとのランダム ID を記録する
- 既存のロックがあれば、保持者の生死や記録の可読性を問わず常に中止する。引き継がず、解除用の引数も設けない。標準エラー出力にロックのパス、記録された PID・作成時刻 (読み取れた範囲)、削除の案内を出す (空・破損でも中止する)
- `releaseLock(lock)` は、記録のランダム ID が自分の実行のものと一致するときだけ削除する (DD-13)。解放の失敗は警告のみで、例外にも終了コードにも影響させない (DD-14)
- 取得できなかったロックには触れず、他の実行のファイルを 1 つも削除しない
- テスト (abbrev RS): 取得成功、既存ロックでの中止と表示内容、破損ロック、ランダム ID 不一致での非削除、解放失敗の警告

#### Commit 12: `feat(mutation): sweep leftovers, hash sources and detect drift`

**参照**: REQ-F-007、REQ-F-008、REQ-NF-001、`specifications-execution.md` R-205、R-206、R-212

**変更**:

- `sweepArtifacts(dirs)` を追加する。Commit 3 の命名判定に一致するファイルだけを削除し、`foo.mutation.ts` のような似た名前は残す。ロック取得後にのみ呼ばれる前提とする
- `hashSources(files)` を追加する。内容ハッシュには `_cle-libs/libs/io/hash.ts` の `sessionHash(content, 64)` (SHA-256 の全桁) を使う
- 同じファイルの `generateHash` は使わない。時刻と乱数を種に混ぜるため、同じ内容でも呼ぶたびに値が変わり、全ファイルが drift と判定される
- `detectDrift(before, after)` を追加する。内容が変わったファイルを返す
- `removeArtifacts(paths): Promise<string[]>` を追加する。削除に失敗したパスを例外にせず返す。掃除と Commit 14 の後始末の両方が使う
- 削除失敗の扱いは呼び出し元によって異なる。後始末で削除できなかったものは残骸ファイルとして集め、実行を続ける (R-226、DD-05)。起動時の掃除で 1 件でも削除できなければ、監査単位の失敗として中止する (DD-14、Commit 16)
- `sweepArtifacts` は削除に失敗したパスを返すところまでを担う。中止の判断は main が行う
- テスト (abbrev RS): 命名に一致するものだけ削除、似た名前の保持、削除失敗パスの返却、ハッシュの安定性、drift の検出 (変更・削除)

#### Commit 13: `feat(mutation): run baseline before mutants`

**参照**: REQ-F-016、DR-08、`specifications-execution.md` R-207〜R-209、R-227、DD-06、DD-10

**変更**:

- `baseline.ts` に `runBaseline(runner, args, { timeoutMs, signal }): Promise<BaselineResult>` を追加する。`BaselineResult` は `ok`、`failed { reason }`、`interrupted` のいずれかで、型は Commit 2 の型ファイルに置く
- 元の設定のまま 1 回だけ実行する。非 0 終了、timeout、起動失敗、passed が 0 件、要約行が無い場合は `failed` とする
- `signal` を runner に渡す。実行中に中止されたら、テストの終了を待って `interrupted` を返す。`failed` とは区別し、main は中断の経路 (R-227、R-228) へ進む
- 件数の取得は Commit 5 の `parseSummary` を再利用し、解釈を重複させない
- 制限時間は `--timeout` の値をそのまま使う (変異体と同じ)
- テスト (abbrev BL): 成功、非 0、timeout、起動失敗、要約行なし、passed 0 件、中止による `interrupted`。注入した `TestRunnerProvider` で検証する

#### Commit 14: `feat(mutation): run mutants sequentially with guaranteed cleanup`

**参照**: REQ-F-005、REQ-F-006、DR-05、`specifications-execution.md` R-210、R-211、R-214〜R-219、R-225〜R-227、DD-05

**変更**:

- `run-mutants.ts` に `runMutants(mutants, options): Promise<{ results, leftovers, interrupted }>` を追加する。`options = { configPath, testArgs, timeoutMs, testRunner?, signal? }` で、既定値は分割代入で与える
- `for...of` + `await` の逐次ループとし、DR-05 の理由 (テストプロセス自体が並列実行するため) をコメントに残す
- 1 件ごとに stage → run → classify を行い、`finally` で変異体ファイルと一時設定を Commit 12 の `removeArtifacts` で削除する。error / timeout は記録して続行する (R-211)
- 削除できなかったファイルは `leftovers` に集める (DD-05)。位置不一致は Commit 4 の error 結果を使い、テストを起動しない
- 中断信号を受けたら、実行中のテストを終了し、その変異体の判定は記録せず、後始末をして停止する (R-227)。`interrupted` を返す
- テスト (abbrev RM): 注入ランナーで 5 判定の記録、例外経路の後始末、続行、残骸の収集、中断時に判定を記録しないこと

### Phase 3: CLI 統合

#### Commit 15: `feat(mutation): parse mutate-tester arguments`

**参照**: REQ-F-012 (引数)、REQ-C-003、`specifications-report-cli.md` R-601〜R-604、DD-01、DD-03

**変更**:

- `scripts/testing/mutate-tester.ts` を新設し、`parseMutateArgs(argv)` を追加する。結果は `{ module, strict, timeoutSec }`
- モジュール名は libs / classify / export / filter / normalize / set のみ許可する。`all`・`classes`・`scripts`・ディレクトリ名・未指定は `ChatlogError` を投げる
- `--timeout` は正の整数 (秒) のみで、既定は 120。0・負数・小数・非数・値の欠落はエラーにする
- `parseOptions` (`_cle-libs/libs/io/parse-args.ts`) で正の整数を表現できるかをここで確認する。できなければ解析後に自前で検証する
- 引数エラーは何も書き込む前に投げる。理由と許可値の一覧を含める
- テストは `scripts/testing/mutation/__tests__/unit/mutate-tester.unit.spec.ts` に置く。owns (`scripts/testing/mutation/**`) の範囲内に置くことで、Commit 17 の owns 拡張はソース `mutate-tester.ts` 1 件で済む
- テスト (abbrev MT): 許可値、不正値、`--timeout` の全境界、`--strict`

#### Commit 16: `feat(mutation): orchestrate audit in main with SIGINT handling`

**参照**: REQ-F-001〜REQ-F-018 (結線)、REQ-C-003、REQ-C-006、`specifications-index.md` R-001〜R-014、DD-01、DD-02、DD-04、`specifications-execution.md` R-204、R-208、R-227、R-228、DD-08、DD-14

**変更**:

- `main(argv?): Promise<number>` を追加する。順序は 引数 → `resolveTargets` → `loadAllowlist` → `acquireLock` → SIGINT リスナー → 掃除 → ハッシュ → ベースライン → 生成 → `runMutants` → 照合 → drift → レポート → ロック解放。Deno.exit は `if (import.meta.main)` ブロックのみに置く
- ベースラインで中止する場合も drift 検査を行い、drift を標準エラー出力に列挙する。変異体 0 件でもベースラインを実行し、照合は古いエントリの抽出だけを行う
- SIGINT (`Deno.addSignalListener`) はロック取得後に受け付ける。受信時は `AbortController` を中止し、その `signal` をベースラインと `runMutants` の両方に渡す
- ハッシュ記録の完了前に届いた場合は、その工程を終えてから drift 検査を省き、中断だけをレポートしてロックを解放し、130 を返す (execution R-227、index R-014 v1.0.1)
- ベースラインが `interrupted` を返した場合は、ベースライン失敗 (非 0) としては扱わない。drift 検査を行い、中断として判定 0 件のレポートを出し、ロックを解放して 130 を返す (R-227、R-228)
- 掃除・ハッシュ・レポート出力の失敗は監査単位の失敗として非 0 で中止し、ロックは解放する (DD-14)。掃除の失敗には、`sweepArtifacts` が削除に失敗したパスを 1 件以上返した場合を含む。ロック解放の失敗は警告のみ
- コミット前に production の import を grep し、`runMutants`・`runBaseline`・ロック・許容リスト・レポートがすべて main から到達できることを確認する。`deno task test:module all scripts` を通す (bdd-cycle ルール)
- テスト (abbrev MT): 注入した提供元で順序、各中止経路 (引数・許容リスト・ロック・掃除の削除失敗・ベースライン・drift)、終了コード、SIGINT (ハッシュ記録前・ベースライン中・変異体の実行中)、ロック解放の保証

#### Commit 17: `chore(mutation): add test:mutate task and extend module owns`

**参照**: `specifications-index.md` Section 4 の impl-note、`specifications-report-cli.md` Section 4.3 の impl-note、REQ-F-012

**変更**:

- `deno.jsonc` に `test:mutate` タスクを追加し、`mutate-tester.ts` を必要な権限 (read / write / run / env) 付きで起動する。`deno task test:mutate <module> [--strict] [--timeout <秒>]` の形で呼べることを確認する
- `module.md` の owns に `scripts/testing/mutate-tester.ts` を追加する (ユーザー決定)。テストは Commit 15 で owns の範囲内に置いたため追加は不要
- `import.meta.main` ブロックで `main` の戻り値を `Deno.exit` に渡し、例外はメッセージを標準エラー出力へ出して 1 で終えることを確認する
- 変更が設定ファイルと文書に限られるため、新規テストは追加しない。`deno task test:mutate` の引数エラー経路を手動で 1 回確認し、結果を beads の note に残す

#### Commit 18: `test(mutation): verify mutant replacement takes effect (integration)`

**参照**: REQ-F-003、REQ-NF-001、REQ-NF-004、index DD-08 (差し替えの有効性は実行時に検査せず integration で固定する)、AC-003、AC-009

**変更**:

- 小さなソースとそれを import するテストを持つ fixture モジュールを一時ディレクトリに作り、実際の `deno test` で `runMutants` を実行する
- 検出されるべき変異体が killed になることで、`imports` による差し替えが実際に効いていることを固定する (実行時の検査を持たないため、有効性はこのテストが担う)
- 実行後に元ソースの drift が 0 件であること、変異体ファイルと一時設定が残らないことを確認する
- 差し替えが効かない場合に全件 survived になる前提を、fixture の期待値で確認する (レポートの警告 R-613 の根拠)
- テスト (abbrev MTI): integration のみ。実行時間を抑えるため fixture の変異体は少数に絞る

---

## 3. 補足事項

### 3.1 要件との差分

次の 5 点は仕様で決め、要件 v1.1.0 に追記済み (cle-kju.17.9)。あわせて REQ-F-004 を execution DD-12 に揃えた。

1. `--strict` で古い許容エントリも失敗にする (report-cli R-619、index DD-07)。REQ-F-014 に無い
2. SIGINT の終了コード 130 (execution DD-08、report-cli R-614)。REQ-F-013 に無い
3. `--timeout <秒>` の CLI オプション (report-cli R-603 / R-604)。REQ-NF-003 は既定値のみを定める
4. ロックファイル `temp/mutation.lock` の書き込み (REQ-F-017) は、REQ-NF-001 の書き込み範囲を超える
5. 残骸掃除・ハッシュ取得・レポート出力の失敗を非 0 で中止する (execution DD-14)。REQ-F-013 の列挙に無い

### 3.2 再利用するライブラリと使わないもの

再利用する:

- `ChatlogError(kind, subindex, detail)` (`_cle-libs/classes/ChatlogError.class.ts`): 引数エラー・許容リストエラー・ロック失敗
- `logger` (`_cle-libs/libs/io/logger.ts`): log は標準出力、info / warn / error は標準エラー出力
- `removeFile`、`fileExists` (`libs/file-ops`): 後始末と存在確認
- `sessionHash` (`libs/io/hash.ts`): ソースの内容ハッシュ。長さに 64 を渡して全桁を使う
- `getProjectRoot`、`toSlashPath` (`libs/path-utils`): パスの解決と `/` 区切りの統一
- `parseOptions` (`libs/io/parse-args.ts`): 引数の解析 (正の整数を表現できない場合は解析後に検証。Commit 15 で確認)
- `@std/yaml` (許容リスト)、`@std/jsonc` (deno.jsonc。Commit 4 で追加)
- `aplys-tester.ts` の `MODULE_GLOB_TABLE`、`VALID_MODULES`、`buildBaseGlob`、`SKILL_MODULES` (Commit 3 で `_SKILL_MODULES` を改名して export)

使わない:

- `writeTextFile` (`write-utils.ts`): 改行を正規化するため、CRLF の保持 (REQ-NF-004) を壊す。変異体は `Deno.writeTextFile` で適用後の文字列をそのまま書く
- `CommandProvider` (`build-ledger.ts`): stderr とシグナルを持たない。新しい `TestRunnerProvider` を使う (REQ-NF-002)
- 別名表の複製: `aplys-tester.ts` から export して共有する
- 共有のロックユーティリティ: リポジトリに無い。`run-safety.ts` に新設する

### 3.3 production 到達性の確認

bdd-cycle ルールに従い、Commit 16 の前後で production の import を grep する。unit テストが全件 green でも、呼び出し元の有無は検証されないため、次の表を確認項目とする。

| 単位                                                                         | 呼び出し元 (期待)              | 確認コミット |
| ---------------------------------------------------------------------------- | ------------------------------ | ------------ |
| `resolveTargets`                                                             | `main`                         | C16          |
| `loadAllowlist`、`matchAllowlist`                                            | `main`                         | C16          |
| `applyMutant`、`toMutantPath`、`buildMutationConfig`                         | `runMutants`                   | C14          |
| `classifyOutcome`、`parseSummary`                                            | `runMutants`、`runBaseline`    | C14, C13     |
| `runDenoTest`                                                                | 既定の `TestRunnerProvider`    | C14, C16     |
| `acquireLock`、`releaseLock`、`sweepArtifacts`、`hashSources`、`detectDrift` | `main`                         | C16          |
| `removeArtifacts`                                                            | `sweepArtifacts`、`runMutants` | C12, C14     |
| `runBaseline`、`runMutants`                                                  | `main`                         | C16          |
| `formatReport`、`decideExitCode`                                             | `main`                         | C16          |

各コミットの前に `deno task test:module all scripts` を通す。型検査が落ちるとモジュールのテストが 1 件も実行されないまま緑に見えるため、これを省略しない。

### 3.4 残る未決

許容リストの未決 (allowlist Section 7 の #1〜#5) は、ユーザーの既定値で解消した (Commit 6 に反映)。

- #1 空白のみの理由は読み込みエラー
- #2 型・値域を検証する (`occurrence` は 1 以上の整数、`op` は `MutationOp`、`file` / `lineText` / `before` は文字列、`after` は空文字を許す文字列)
- #3 `file` はリポジトリルート相対で `/` 区切り
- #4 キーが重複したエントリはエラー
- #5 空文書 (内容なし・コメントのみ) はエントリ 0 件。`~` / `null` / `---` だけの明示的な null 文書は空文書に含めず、最上位が列でない文書として R-502 の読み込みエラーとする (fail closed)。`@std/yaml` はどちらも `null` を返すため、空文書かどうかは本文テキスト (全行が空白またはコメント) で判定する

実装で扱わず、残す未決:

| 出典                 | 内容                                                                              | 本計画での扱い                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| report-cli OQ #2     | kill 率の分母を killed + survived とした (DD-05)。timeout / error を含める案      | 仕様どおり実装。数値のみに影響し終了コードは変わらない                                                                                                                          |
| report-cli OQ #5     | `--timeout=30` 形式、未知のオプション、重複指定、オプションの位置、余分な位置引数 | Commit 15 の `parseOptions` の挙動に従う。規則を足す場合は仕様の改訂が先                                                                                                        |
| report-cli OQ #6     | 有効判定が 1 件のみで survived のファイルも警告するか (R-613 の最小件数)          | 仕様どおり (件数の下限なし)。ノイズが問題になれば別 issue                                                                                                                       |
| report-cli OQ #7     | 中断時に未実行の変異体の件数を出すか                                              | 出さない (判定済みのみ)。生成件数は「変異体 0 件」の判定にだけ使う (Commit 8)                                                                                                   |
| execution OQ #3      | 残骸と同じ番号の変異体を書き出す際の衝突                                          | 掃除がロック取得直後にあるため通常は起きない。起きた場合は error 扱い                                                                                                           |
| execution OQ #4      | 子孫プロセスが残る場合の検出と報告                                                | 範囲外 (直接の子プロセスのみ)。残留プロセスは検出も報告もしない。残留プロセスが変異体ファイルを開いたままで削除に失敗した場合に限り、そのファイルが残骸ファイルとして報告される |
| index Section 7.2 #5 | 孫プロセスの残留を Windows で範囲外とする前提が十分か                             | 範囲外のまま。Commit 18 の fixture 実行で干渉が出れば beads に記録する                                                                                                          |

---

## 4. Rule Coverage

### 4.1 specifications-index.md (R-001〜R-014)

| Rule  | 内容 (短縮)                                    | Commit        |
| ----- | ---------------------------------------------- | ------------- |
| R-001 | 引数の解釈。不正なら何も書かずに非 0           | C15, C16      |
| R-002 | モジュール名から対象集合を決める               | C3, C16       |
| R-003 | 許容リストの検証。不正なら実行せず非 0         | C6, C16       |
| R-004 | ロック取得。失敗なら掃除も実行もしない         | C11, C16      |
| R-005 | 命名規則に一致する残骸だけ削除                 | C12, C16      |
| R-006 | ソース全件のハッシュ記録                       | C12, C16      |
| R-007 | ベースライン。失敗または 0 件なら中止          | C13, C16      |
| R-008 | 変異体の生成。0 件のとき照合は古いエントリのみ | C16           |
| R-009 | 変異体の逐次処理と後始末                       | C14           |
| R-010 | survived の照合と古いエントリの抽出、警告      | C7, C8        |
| R-011 | ハッシュ再取得と drift 突合                    | C12, C16      |
| R-012 | レポートの出力                                 | C8, C16       |
| R-013 | ロック解放と終了コードの決定                   | C9, C11, C16  |
| R-014 | SIGINT: 後始末・drift・レポート・解放・130     | C13, C14, C16 |

### 4.2 specifications-generation.md (R-101〜R-112)

| Rule  | 内容 (短縮)                                 | Commit          |
| ----- | ------------------------------------------- | --------------- |
| R-101 | モジュール配下の TS / TSX を候補にする      | C3              |
| R-102 | `__tests__/`・spec・types・constants を除外 | C3              |
| R-103 | 変異体・一時設定の命名に一致するものを除外  | C3, C4          |
| R-104 | 判定用テストは当該モジュールの unit のみ    | C3              |
| R-105 | 集合を昇順で返す                            | C3              |
| R-106 | コメント内は生成しない                      | 既存 (T-01)、C1 |
| R-107 | 正規表現を含む行は生成しない                | 既存 (T-01)、C1 |
| R-108 | 文字列・テンプレートの文字列部は生成しない  | 既存 (T-01)、C1 |
| R-109 | import 行・型位置のジェネリクスは生成しない | 既存 (T-01)、C1 |
| R-110 | オペレータ適用箇所ごとに生成                | 既存 (T-01)、C1 |
| R-111 | 上記に該当しなければ生成しない              | 既存 (T-01)、C1 |
| R-112 | 行・桁の昇順で決定的に返す                  | 既存 (T-01)、C1 |

### 4.3 specifications-execution.md (R-201〜R-228)

| Rule  | 内容 (短縮)                                      | Commit        |
| ----- | ------------------------------------------------ | ------------- |
| R-201 | ロック取得前は作成・削除・テスト起動をしない     | C11, C16      |
| R-202 | 既存ロックは常に中止。パス・記録・削除案内を表示 | C11           |
| R-203 | PID・作成時刻・ランダム ID を記録                | C11           |
| R-204 | ロック取得後に SIGINT の受信を開始               | C16           |
| R-205 | 命名規則に一致するファイルだけ掃除               | C12, C16      |
| R-206 | 元ソース全件のハッシュ記録                       | C12           |
| R-207 | 元の設定のままベースラインを 1 回実行            | C13           |
| R-208 | ベースライン失敗・0 件で中止。drift 検査も行う   | C13, C16      |
| R-209 | ベースライン成功なら逐次実行へ                   | C13, C16      |
| R-210 | 変異体を 1 件ずつ、後始末後に次へ                | C14           |
| R-211 | error / timeout は記録して続行                   | C14           |
| R-212 | ハッシュ再取得と突合                             | C12, C16      |
| R-213 | ランダム ID を確認してロックを解放               | C11, C16      |
| R-214 | 位置不一致は error、テストを起動しない           | C4, C14       |
| R-215 | 変異体を命名規則どおり別ファイルで書き出す       | C4            |
| R-216 | 全キーを保つ一時設定に imports を 1 件足す       | C4            |
| R-217 | 一時設定を指定して制限時間つきで実行             | C10, C14      |
| R-218 | 制限時間超過で直接の子プロセスを終了             | C10           |
| R-219 | 書き出し・起動の失敗は error                     | C10, C14      |
| R-220 | 終了 0 は survived                               | C5            |
| R-221 | 型検査失敗は compile-error                       | C5            |
| R-222 | 要約行で失敗を確認できれば killed                | C5            |
| R-223 | timeout は timeout                               | C5            |
| R-224 | 失敗を確認できない非 0 終了・error は error      | C5            |
| R-225 | 正常・失敗・例外のいずれでも後始末               | C14           |
| R-226 | 削除失敗は残骸として列挙し警告                   | C8, C14       |
| R-227 | SIGINT: 実行中のテストを終了し判定を記録しない   | C13, C14, C16 |
| R-228 | 後始末後に drift・レポート・解放・130            | C16           |

### 4.4 specifications-allowlist.md (R-501〜R-510)

| Rule  | 内容 (短縮)                                     | Commit  |
| ----- | ----------------------------------------------- | ------- |
| R-501 | ファイルが無ければエントリ 0 件                 | C6      |
| R-502 | 解釈できなければ読み込みエラー                  | C6      |
| R-503 | 理由が欠落・空ならエラー                        | C6      |
| R-504 | 必須属性の欠落・不正値はエラー                  | C6      |
| R-505 | エラーが 1 件でもあれば実行せず非 0。全件を列挙 | C6, C16 |
| R-506 | survived 以外は許容判定の対象にしない           | C7      |
| R-507 | キー一致で許容済みの生存                        | C7      |
| R-508 | 一致なしは未許容の生存                          | C7      |
| R-509 | どの変異体にも一致しないエントリは古いエントリ  | C7      |
| R-510 | 古いエントリを列挙して報告側へ渡す              | C7, C8  |

### 4.5 specifications-report-cli.md (R-601〜R-620)

| Rule  | 内容 (短縮)                                | Commit  |
| ----- | ------------------------------------------ | ------- |
| R-601 | モジュール名が無ければ引数エラー           | C15     |
| R-602 | 許可値以外は引数エラー                     | C15     |
| R-603 | `--timeout` が正の整数でなければ引数エラー | C15     |
| R-604 | 引数解決の成功。既定 120 秒                | C15     |
| R-605 | 中断のレポートは途中結果と明示             | C8      |
| R-606 | 変異体 0 件を明示                          | C8      |
| R-607 | 判定ごとの件数と survived の内訳           | C8      |
| R-608 | kill 率・有効判定率                        | C8      |
| R-609 | 未許容の生存の一覧                         | C8      |
| R-610 | 古い許容エントリの列挙                     | C8      |
| R-611 | drift の列挙                               | C8      |
| R-612 | 残骸の列挙と警告                           | C8      |
| R-613 | 全件 survived のファイルの警告             | C8      |
| R-614 | 中断は 130 (最優先)                        | C9, C16 |
| R-615 | 監査単位の失敗・drift は非 0               | C9      |
| R-616 | 既定は 0                                   | C9      |
| R-617 | `--strict` で未許容の生存があれば非 0      | C9      |
| R-618 | `--strict` で有効判定 0 件なら非 0         | C9      |
| R-619 | `--strict` で古いエントリがあれば非 0      | C9      |
| R-620 | 上記のいずれにも該当しなければ 0           | C9      |

---

## 5. AC Coverage

| AC     | 担当ファイル | Commit                    |
| ------ | ------------ | ------------------------- |
| AC-001 | generation   | 既存 (T-01)、C1           |
| AC-002 | generation   | 既存 (T-01)、C1           |
| AC-003 | execution    | C4, C18                   |
| AC-004 | execution    | C5                        |
| AC-005 | execution    | C5                        |
| AC-006 | execution    | C14                       |
| AC-007 | execution    | C14                       |
| AC-008 | execution    | C12                       |
| AC-009 | execution    | C12, C18                  |
| AC-010 | allowlist    | C7                        |
| AC-011 | allowlist    | C6                        |
| AC-012 | allowlist    | C7                        |
| AC-013 | report-cli   | C8                        |
| AC-014 | report-cli   | C15 (引数)、C3 (対象解決) |
| AC-015 | report-cli   | C9                        |
| AC-016 | report-cli   | C9                        |
| AC-017 | execution    | C13                       |
| AC-018 | execution    | C13                       |
| AC-019 | execution    | C11                       |
| AC-020 | report-cli   | C9                        |
| AC-021 | report-cli   | C8, C9                    |
| AC-022 | report-cli   | C9                        |
| AC-023 | report-cli   | C16                       |
| AC-024 | report-cli   | C15                       |

---

## 6. Change History

<!-- SemVer: MAJOR = approach discarded, MINOR = decision criterion added,
     PATCH = clarification only. Keep frontmatter `version` equal to the newest row.
     `based-on` must cite a three-part version that exists in specifications.md.
     See docs/.deckrd/rules/deckrd-rule-document-versioning.md -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | 1.0.0   | Initial implementation plan                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-08 | 1.1.0   | codex consistency レビューの 8 件を反映: ベースラインの中断 (`interrupted`)、掃除と後始末の削除失敗の区別 (`removeArtifacts`)、生成件数と判定済み件数の区別、用語 (残骸ファイル / 残留プロセス、照合) と R-201 / R-506 の要約の訂正、`runMutants` の戻り値、BDD 同梱の適用範囲                                                                                                                                          |
| 2026-10-08 | 1.2.0   | tasks 生成前の調査で判明した食い違いを修正: ソースハッシュを `generateHash` (非決定的) から `sessionHash` へ、`aplys-tester.ts` の `SKILL_MODULES` の export、`MutationRunReport` を C8 のレポート入力型へ移動、`TestRunOutcome` / `runMutants` の仕様 impl-note との差の明記、テスト ID の段数とグループ帯、`mutate-tester` のテスト配置、C18 の DD 参照 (index DD-08)、未決 2 件 (R-014 と R-227、ハーネス自身の変異) |
| 2026-10-08 | 1.2.1   | 仕様 index v1.0.1 (R-014 を execution R-227 に揃えた) に追従: based-on を更新し、3.4 の該当未決を削除                                                                                                                                                                                                                                                                                                                   |
| 2026-10-08 | 1.3.0   | 仕様 v1.1.0 に追従: 許可するモジュール名から `scripts` を除き 6 件に (C3 / C15)。3.4 のハーネス自身の変異の未決を削除                                                                                                                                                                                                                                                                                                   |
| 2026-10-08 | 1.3.1   | 要件 v1.1.0 / 仕様 index v1.1.1 に追従: based-on を更新し、3.1 を追記済みに改め、AC-022〜AC-024 を 5 章へ追加                                                                                                                                                                                                                                                                                                           |
| 2026-10-09 | 1.4.0   | 3.4 #5 に明示的な null 文書の扱い (R-502 の読み込みエラー) と空文書の判定方法を追加 (cle-kju.17.2.1)                                                                                                                                                                                                                                                                                                                    |
| 2026-10-09 | 1.5.0   | Commit 7 に `matchAllowlist` の前提 (判定の変異体は生成された変異体に含まれる。違反は `ChatlogError`) を追加 (cle-kju.17.2.2)                                                                                                                                                                                                                                                                                           |
| 2026-10-09 | 1.6.0   | UTF-8（BOM なし）規約 (coding-guidelines.md) に従い、BOM 付きのソースの扱いを仕様から外す。BOM の無い入力を前提とする (cle-kju.17.1.2)                                                                                                                                                                                                                                                                                  |
