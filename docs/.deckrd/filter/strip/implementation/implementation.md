---
title: "Implementation Plan: filter strip"
based-on: specifications.md v6.0.0
status: Draft
version: 3.7.0
created: "2026-08-13"
---

<!-- textlint-disable
  ja-technical-writing/sentence-length -->

## 1. Overview

### 1.1 目的と規模

`filter strip` を `filter-chatlogs` スキルの 3 つ目のサブコマンドとして追加する。
エクスポート済みチャットログ Markdown の冒頭にある set-frontmatter 由来の定型プロンプト部を
in-place で除去し、実質的な会話内容のみを残す。除去範囲は本文先頭から最初の `## Summary` の
直前までとする。

対象規模は claude/2026-07 の 11671 件(275.3MB)、うち除去対象 6398 件。6000 件規模の破壊的な
in-place 書き換えを伴う。したがって設計原則は「除去してよい根拠が積極的に確認できた場合のみ
除去する」という保守側に倒したものとする。

### 1.2 設計の骨格

**分類は 5 値**。各入力ファイルは相互排他な 5 分類(stripped / done / passthrough / error /
skipped)のいずれかになる(DR-29 決定 3)。`skipped` は「除去対象だが dry-run のため書き込みを
見送った」を表し、R-008 に到達した場合にのみ `stripped` から振り替わる。`StripStats` は分類と
同名の件数フィールドを持ち、統計サマリーも同じ 5 分類である(DR-30)。通常実行では `skipped` が
0、dry-run では `stripped` が 0 となり、両者は排他。加えて受理範囲外の起動は実行そのものを
拒否する(R-001)。

判定規則は **R-001〜R-017 の 17 個** で構成され、評価順序を変更しない。うち R-014 / R-015 は
実行モードを、R-016 / R-017 は列挙の前提を定める規則であり、ファイル単位のカスケードには
含まれない。境界検出は行頭完全一致による `^## Summary$` / `^## TOPICS ASSIGNMENT RULES$` の
2 文字列で行い、Markdown 構文解析はしない。

**判定カスケードは単一の関数(`classifyStrip`)に閉じる。** 安全弁(R-002 と R-007)が同一
カスケードの中に位置し、仕様が評価順序の変更を禁じるため、分割はカスケードの分断・二重化を
招く。これは DR-15 が定めた「分類ロジックは単一の判定関数に閉じる」という制約と一致する。

**判定と書き込みは 1 ファイル単位のパイプラインへ統合する**(DR-28 決定 1)。1 ファイルが
「分類 → 処理 → ログ出力 → 件数加算」を一気通貫で完結させ、フェーズ間の全件バリアを持たない。
実行は `runConcurrent` により並列度 `config.concurrency` に制限する(DR-28 決定 3)。退避の
一括削除(`sweepBackups`)のみディレクトリ単位の処理としてループの外に留める(DR-28 決定 4)。
`dryRun` は `_processFiles` / `_classifyFile` / `classifyStrip` が引数で受け取り、1 ファイル
ごとに内部で分岐する。

### 1.3 関連文書

本書は実装完了後の根拠記録です。記載する Commit は実装済みであり、パスと関数名は
現行のコードを指す。

- Specifications: `specifications/specifications.md` v6.0.0(based-on: `requirements/requirements.md` v9.0.0)
- Decision Records: `decision-records.md`(DR-01〜DR-40)
- Reviews: codex risk レビュー / codex second opinion (impl) / codex review (PR #409) /
  実装レビュー(DR-26〜DR-40)
- Working Note: `implementation/phase-design-note.md` v3.3.0。Phase 0〜7 の分解・規則網羅性検証・
  型/定数配置の根拠を確定済み。本書はこのノートを Phase 分解として採用する。ノートは削除・改変せず
  併存させる。ただし DR-28 / DR-29 / DR-31 により破棄された 4 点があり、同ノート冒頭の
  Superseded 注記に記載がある
- 定型部テンプレートの正本: `.config/chatlog-exporter/prompts/meta.yaml` の 26 行目に
  `## TOPICS ASSIGNMENT RULES` が存在する
- Prior Art / Reference PR: なし。関連 issue は `cle-2rf`(`P2` / `feature` / `in_progress`)。
  issue の Design と受け入れ基準は DR-02 と矛盾したままであり、spec の Open Question 1 として
  記録されている

---

## 2. Implementation Plan

実行フェーズ(実行順序、Phase 0〜7)と Commit(層によるグループ化)は異なる軸で管理する。
DR-28 以降、実行フェーズ 2〜5 は 1 ファイル単位のパイプライン(`_processFiles`)として統合されて
おり、フェーズ番号は独立した実行単位ではなく **操作の順序** を示す。

以下の見出しの「実装ステージ」は Commit をグループ化する軸であり、実行フェーズ 0〜7 とは
番号空間が異なる。

### Commit 番号の対応(v3.6.0 → v3.7.0)

v3.7.0 で Commit 10 を 3 つへ分割した。旧番号での参照(`decision-records.md` 本文中の記載など)は
本表で解決する。

| v3.6.0 まで | v3.7.0 以降                                               |
| ----------- | --------------------------------------------------------- |
| Commit 1〜9 | 変更なし                                                  |
| Commit 10   | Commit 10(孤立退避・復帰)/ 11(エントリポイント)/ 12(報告) |
| Commit 11   | Commit 13                                                 |

### 実装ステージ 1: `_cle-libs` 基盤拡張(下位レイヤ・先行必須)

#### Commit 1: `feat(cle-libs): add BackupProvider type and backupToBak`

- `BackupProvider` 型を `types/providers.types.ts` に追加する
- `libs/file-ops/backup-to-bak.ts` に `<name>.md` を `<name>.md.bak` へリネームする Provider を実装する
- 戻り値は `Promise<string | null>` とし、`BackupProvider` 型と厳密に一致させる(DR-17)
- 既存 `.bak` があるファイルはリネームをスキップし `null` を返す。例外は throw しない。
  連番・世代管理は持たない
- ミラー: 下記「共有ライブラリのミラー」を適用する

#### Commit 2: `feat(cle-libs): support BackupProvider in writeTextFile`

- `writeTextFile` の第 3 引数に `BackupProvider` を追加する
- tmp 書き出し → 退避 → 差し替えの 3 ステップを行い、退避先パス、または退避を作成しなかった場合は
  `null` を返す(`Promise<string | null>`、REQ-NF-005 / DR-03 決定 4 のコード例どおり)
- 未指定時は現行と同一の挙動を維持する

#### Commit 3: `feat(cle-libs): add frontmatter identity comparison`

- `ChatlogFrontmatter` に 2 つの frontmatter の同一性を判定する手段を追加する
- キー集合と各キーの値を比較し、キーの出現順序は比較対象に含めない(AC-024)
- 値は `string` / `string[]` のいずれかであり、`string[]` は長さと各要素を順に比較する
- 既存メソッドの挙動は変更せず追加のみとする
- 呼び出し元は AC-024 の検証テストであり、書き込みシーケンス(Commit 8)からは呼ばない(DR-19)

#### Commit 4: `refactor(cle-libs): widen backupOldPath return type`

- `backupOldPath` の戻り値を `Promise<string | null>` に拡張する
- 連番セマンティクス(`.old-NN.md`)は維持する
- **strip が用いる退避は Commit 1 の `backupToBak` であり `backupOldPath` ではない**(DR-17)。
  本 commit の拡張は `BackupProvider` 型への適合のみを目的とし、strip の振る舞いには影響しない
- 唯一の本番呼び出し `normalize-chatlogs/scripts/modules/segment-io.ts:167` は戻り値を使用して
  いないため後方互換である

### 実装ステージ 2: strip の型・定数

#### Commit 5: `feat(filter): add strip constants and types`

- `constants/strip.constants.ts` に `STRIP_BOUNDARY_HEADING` と `STRIP_TEMPLATE_MARKER` を定義する。
  あわせて R-007 の除去率上限 `STRIP_MAX_REMOVAL_RATE`、および復帰専用モードのキャッシュ削除の
  再試行に用いる `STRIP_CACHE_DELETE_ATTEMPTS`(= 2)/ `STRIP_CACHE_DELETE_RETRY_WAIT_MS`(= 100)を
  定義する(DR-27)。`GlobalConfig.maxRetry` は `runAI` 用かつ待機を持たないため転用しない
- `types/strip.types.ts` に判定結果の型を新設する。フィールドは `outcome` / `reason` /
  `removalStartLine` / `removalEndLine` / `removedBytes`。`StripOutcome` は `stripped` / `done` /
  `passthrough` / `error` / `skipped` の 5 値とする(DR-29 決定 3)。除去範囲と除去バイト数は
  dry-run 明細へ出力しなくなるが、`writeStripped` が除去範囲として使うため **存続** する
- `types/strip-config.types.ts` の `StripConfig` に `concurrency` を追加し、
  `DEFAULT_STRIP_CONFIG` へ `DEFAULT_CONFIG_VALUES.concurrency` を与える(DR-28 決定 3)。
  スキーマ定義(`config-schema.constants.ts`: `min: 1, max: 10`、既定 4)は既存のものを流用し、
  新設しない。これにより兄弟の `DEFAULT_FILTER_CONFIG` / `DEFAULT_NOISE_FILTER_CONFIG` と同じ形になる
- `types/stats.types.ts` に `StripStats` を追加する。フィールドは
  `{ total, stripped, skipped, done, passthrough, error }` とし(DR-30)、`BaseStats` を継承しない。
  `BaseStats.skip` は「dry-run/report 等により判定・削除の実行自体を行わなかった数」を意味し、
  モード非依存の `done` と衝突する(DR-15 が Option D として却下した命名)
- `types/cache.types.ts` に `StripCache`、`types/strip-cache-status.const.types.ts` に
  `STRIP_CACHE_STATUSES` を追加する。`STRIP_CACHE_STATUSES` は `STRIPPED` と `PASSTHROUGH` を持ち、
  いずれも実際に書き込まれる値とする(DR-31 決定 1。`PASSTHROUGH` は DR-31 以前、到達しない定数だった)

### 実装ステージ 3: 判定ロジック(副作用なし・テスト量が最大)

#### Commit 6: `feat(filter): add strip boundary detection`

- 行頭完全一致による `## Summary` と定型部マーカーの検出を実装する
- Markdown 構文を解析しない。コードフェンス内・引用内・リスト内であるかは解釈しない
- 改行分割後の比較単位を確定する(CRLF / LF の双方で同一の検出結果になること)

#### Commit 7: `feat(filter): add strip classification cascade`

- R-002 から R-008 のカスケードを単一の関数 `classifyStrip` として実装する。
  実装配置は `scripts/libs/classify-strip.ts` とする(DR-29 決定 4)。`libs/` 配下の
  `classify-file.ts` / `load-filter-entry.ts` / `find-files-flat.ts` と同じ動詞-目的語順とする
- シグネチャは `classifyStrip(filePath, cache, dryRun, options?)` とする(DR-29 決定 1)。
  `ChatlogCache` を直接受け取り R-003 の評価を関数内部の責務とする。述語注入(`isProcessed`)は
  設けない。判定規則の一部を呼び出し側が組み立てると、呼び出し箇所ごとに規則がぶれる余地が残る
- R-003 が処理済みとみなす status は `stripped` と `passthrough` の 2 つとする(DR-31 決定 2)。
  実装は判定対象の status を定数配列 `_PROCESSED_STATUSES` に置き `includes` で判定する。
  条件を `=== 'stripped'` の連鎖で書くと status の追加時に分岐が増える
- **副作用を持たない**(DR-29 決定 2)。`writeStripped` を呼ばず、分類結果を返すのみとする。
  書き込むか否かは分類結果を見て呼び出し側が判断する。ただし cache を参照し R-004 で `fileExists`
  を呼ぶため **純粋関数ではない**。外部状態を *読む* ことと副作用を持たないことは独立している
- R-004 の `hasBackup` と読み取りの `readProvider` は、実 I/O を切り離すテスト用の注入口として
  `options` に残す(DR-29 決定 1)
- `dryRun` を受け取り、**R-008 に到達した場合のみ** `stripped` を `skipped` へ振り替える
  (DR-29 決定 3)。R-002〜R-007 は dry-run の有無で変化しない。判定前に一律 `skipped` を返すと
  `done` / `passthrough` / `error` の内訳が消え、事前レビューが成立しない。`skipped` は除去範囲を
  `stripped` と同値で担ぐ
- 判定結果として `outcome` / `reason`(該当規則 ID)/ 除去範囲の開始行・終了行 / 除去バイト数を返す
- R-007 の安全弁(除去後が空、除去率 99% 超)を関数内部に含める
- 除去率は除去バイト数 ÷ 本文バイト数(frontmatter を除く)で算出する
- 読み取りは `readTextFile(path, { throwFileIoError: false })` で行う(DR-21)。I/O 起因のエラー
  (`isFileIoError` が `true`)は error に計上して継続し、`reason` に `kind` / `subindex` / パスを
  記録する。I/O 起因でないエラーは再 throw されたものをそのまま伝播させ実行を中断する
  (DR-20 決定 2 の経路)。`PermissionDenied` / `Busy` は I/O 起因のため継続側とする

### 実装ステージ 4: 副作用モジュール(`modules/strip/`)

#### Commit 8: `feat(filter): add strip write pipeline`

実行フェーズの Phase 3 / 4 / 5 を `writeStripped` として実装する。3 段は不可分の書き込み
シーケンスであり、DR-28 の統合後は 1 ファイル単位のパイプラインから `stripped` と判定された
ファイルに対してのみ呼ばれる。

##### 書き込みシーケンス(R-009 / REQ-NF-005)

- tmp 書き出し → 退避 → 差し替え → キャッシュ記録の順で行う
- 失敗は throw せず `ChatlogError` を **戻り値** として返す(`runConcurrent` を reject させない
  ため — DR-28 Rationale)
- `writeTextFile` が返す `null` は「退避を作成しなかった」を意味し、**書き込みは成立している**
  ため error として計上しない(DR-17)。R-004 により既存 `.bak` を持つファイルは done として
  除かれるため実際には観測されない想定だが、観測されても処理を継続する
- キャッシュへの記録は差し替えの成立後に行う。差し替え失敗を処理済みと記録すると、次回 R-003 で
  done となり strip されないまま残るため
- 記録するのは `status: 'stripped'`(成立規則の `R-008` を `rule` に持つ)のみとする
  (DR-31 決定 4)。`passthrough` の記録は退避・差し替えを伴わずこの手順に乗らないため、
  Commit 11 の `_recordPassthrough` が担う

##### 除去範囲の事前検証(DR-35 / DR-36)

除去範囲を適用する直前に、読み込んだ内容との整合を検証する(DR-35)。見るのは次の 4 点です。

1. frontmatter の有無
2. 除去開始行と frontmatter 行数の一致
3. 除去終了行の直後が `STRIP_BOUNDARY_HEADING` であること
4. 範囲の順序

frontmatter の有無は独立した早期 return とする。frontmatter 行数を `-1` に潰すと除去範囲を
持たない分類の `removalStartLine` と一致し、センチネルを担いだ呼び出しが素通りするためです。
`divideEntry` は壊れた frontmatter で throw するため、throw しない `hasFrontmatter` を先に評価し
throw を到達不能にする。不整合は書き込みを行わず `ChatlogError('FailFast', 'StaleDecision')` を
戻り値として返す。

frontmatter 行数の算出は `_cle-libs` の `frontmatterLines` を `classifyStrip` と共有する
(REQ-C-001)。開始辺の照合は両者が同一定義に立つことを前提とするため、実装を複製しない。

この検証は書き込みの直前であってスワップ地点ではないため、読み取りから書き込みまでの間に対象が
差し替わる競合の窓は閉じない。単一書き手前提のもとで残余として受容する(DR-36)。

##### 一時ファイルの衝突と rename の非原子性

一時ファイルの衝突は既存 `writeTextFile` の挙動を維持する。`Deno.rename` が
`Deno.errors.AlreadyExists` で失敗した場合は差し替え先を `Deno.remove` してから再度 rename する
(`write-utils.ts:33-39`)。`<name>.md.tmp` の残骸は上書きされ、エラーとしない。Commit 2 で
第 3 引数を追加する際もこのハンドリングを変更しない。

Windows における rename の同一ボリューム制約は構造上満たされる。一時ファイルは
`outputPath + '.tmp'` であり差し替え先と同一ディレクトリのためです。

ただし `AlreadyExists` の catch → remove → retry は **原子的でない**。remove と rename の間で
中断すると `.md` が存在しない状態が残る。strip の経路ではこの分岐に到達しない想定である
(`backupToBak` が `<name>.md` を `.bak` へリネームした後は差し替え先が存在しないため)。
到達しうるのは `backupToBak` が `null` を返した場合、すなわち既存 `.bak` ありで本体がリネーム
されなかった場合に限られ、その状況は R-004 により done として除かれ書き込み自体に至らない。

この分岐に到達した場合、当該実行の `.bak` は存在しないため、中断すると REQ-NF-005 の保証は
成立しない。防御的に、到達した場合は error として計上し書き込みを行わない。

#### Commit 9: `feat(filter): add strip backup sweep`

- 実行フェーズの Phase 6 を実装する(R-010 / R-011 / R-012 / R-013)
- 削除の前に退避の包含関係を検査する
  (`{ stripped と判定したファイルのパス } ⊆ { 存在する退避のパス }`)
- 包含検査は集合どうしの比較ではなく、**期待される退避パスの実在確認** により行う(DR-25)。
  stripped と判定した各ファイルのパスから期待退避パス `<name>.md.bak` を構成し、Phase 6 が
  削除のために取得する退避一覧との **完全一致** を確認する。比較キーは生成せず、大小文字の変換を
  一切行わない
- 期待退避パスの構成は `normalizePath` 適用後のパスに対して行い、退避一覧も同じ走査
  (`findFiles` 経由で `normalizePath` 適用済み)から得る。両者の正規化を一致させることが本検査の
  前提であり、構成規則がずれると検査全体が成立しない
- 小文字化キーによる比較は採らない(DR-22 を DR-25 により破棄)。大小文字を区別するファイル
  システムでは `Foo.md.bak` が不在でも無関係な `foo.md.bak` を一致とみなし、包含検査が誤って
  成立する。R-013 は復旧手段の不在を検出する安全弁であり、この向きの誤判定は安全弁を無効化する
- 追加の I/O は発生させない。退避一覧は Phase 6 が削除のために既に走査しており、期待パスの照合は
  その結果に対する文字列の完全一致で行う(DR-25。対象は 6398 件規模であり `Deno.stat` の全件発行は
  採らない)
- 不足として報告するパスは stripped 側が保持する原形を出力する(DR-25)
- 削除の **前** に、退避一覧のうち期待退避パスの集合に含まれないものを件数とパスで警告報告する
  (DR-34)。期待退避パスは包含検査と同じ構成方法で作り、報告は判定・戻り値・終了コードを変えない。
  前回中断の残骸と外部由来を区別しない(Phase 6 が受け取るのは stripped のパス集合のみであり
  判別材料を持たない)
- 削除は全件について試行し、1 件の失敗で残りを中断しない
- 削除に失敗した退避は件数とパスを報告し、終了コードを成功以外とする
- 走査は再帰とする(R-017 / DR-39)。理由と、3 経路への同時適用が必須である根拠は
  §4「Phase 1 の列挙が再帰である理由」に記す

#### Commit 10: `feat(filter): add orphan detection and recovery mode`

孤立退避の検出(R-014)と復帰専用モード(R-015)を実装する。

##### 孤立退避の定義と検出(R-014 / DR-23 決定 1 / DR-26)

- 孤立退避とは、対象ディレクトリ配下に `<name>.md` が存在せず `<name>.md.bak` が存在する状態を
  いう。**`<name>.md.tmp` は検出対象に含めない**(DR-26 決定 1)。REQ-NF-005 の手順 1 の時点では
  `<name>.md` が無傷で存在するため、`.tmp` 単独で本体を伴わない状態は正常な処理順序では生じない
- 検出結果は復帰先となる本体パス(`<name>.md`)の一覧として表現する(DR-26 決定 3)。復帰元の
  退避パスは `` `${filePath}.bak` `` により機械的に構成できるため保持しない。これは DR-25 決定 1 が
  R-013 の期待退避パスに対して採る構成方法と同一である
- 通常モード(`--recover-orphans` 無指定)では、当該 `<name>` を error として計上しパスを報告する。
  列挙は `findFiles` が `*.md` を glob するため中断したファイルは列挙されず、R-002〜R-008 のいずれ
  にも到達しない。検出しないと error 0 件のまま Phase 6 に到達し、DR-08 の一括削除で復旧材料の
  `.bak` が失われる
- 本検出はカスケードの外側に置き、R-002〜R-008 とその評価順序は変更しない
- 走査は再帰とする(R-017 / DR-39)

##### 復帰専用モード(R-015 / DR-23 決定 3)

- `--recover-orphans` フラグを追加する。既定は無効。**指定時は復帰専用モードとして動作する**。
  孤立退避の `<name>.md.bak` を `<name>.md` へリネームして復帰させ、そこで実行を終了する。
  復帰したファイルへの strip は行わず、R-002〜R-013 のいずれも評価せず、実行フェーズ 2〜6 に
  進まない。strip するには利用者が結果を確認し、フラグ無しで再実行する
- スキーマは `args-schema.types.ts` の `flag` 型で定義し、strip 側のスキーマに追加する
  (`filter` / `noise-filter` の引数解析は変更しない — DD-04)
- 孤立退避の定義により復帰元は常に存在するため、検出したすべてが復帰の対象となる。
  「未復帰」の分類は持たない(DR-26 決定 2)。`.bak` と `.tmp` が併存する場合に `.bak` を採用し
  `.tmp` を残置する挙動は、`.tmp` を参照しないことで自明に維持される
- 復帰専用モードでも Phase 0 の受理ゲート(R-001)は評価する(DR-23 決定 5)。対象ディレクトリの
  特定に `<agent> <YYYY-MM>` が必要なため。`--dry-run` と併用された場合は復帰せず、対象件数と
  パスの報告にとどめる
- main の分岐は Phase 0 → 復帰 → Phase 7(報告)とする。フェーズ内部に `if (recoverOrphans)` を
  置かない(dry-run と同じ方針)
- R-014 の error 計上と復帰専用モードは排他である。`--recover-orphans` 指定時は通常の strip 処理が
  走らないため孤立退避の error 計上は行わない

##### 復帰後のキャッシュエントリ削除(DR-24 / DR-27)

- 復帰リネームの成功直後に、当該ファイルのキャッシュエントリを削除する(DR-24)。既存の
  `ChatlogCache.delete(filePath)` を用いる(`skills/_cle-libs/classes/ChatlogCache.class.ts:275`)。
  エントリが存在しない場合も正常とし no-op として扱う(中断点によっては未記録である)
- 削除しないと、REQ-NF-005 の手順 3 完了後〜`.bak` 削除前の中断でキャッシュに処理済みの記録を
  残したまま `.bak` も残る。復帰後は本体が未 strip のままキャッシュだけ処理済みという乖離を生む。
  次回実行はこれを判定順序の手順 1 で done と誤判定し、定型部が恒久的に残る
- 削除は固定 2 回まで再試行し、間に 100 ms 待つ(DR-27)。回数と待機は
  `STRIP_CACHE_DELETE_ATTEMPTS` / `STRIP_CACHE_DELETE_RETRY_WAIT_MS` に置き、
  待機は `SleepProvider` として注入可能にする
- 再試行しても失敗した場合は当該ファイルを error として計上しパスを報告する(DR-24)。復帰は
  完了しているがキャッシュが乖離したままであり、次回実行で strip が漏れるため

### 実装ステージ 5: エントリポイントと報告

#### Commit 11: `feat(filter): add strip entry point`

実行フェーズの Phase 0(受理ゲート)/ Phase 1(列挙)/ Phase 2〜5(パイプライン)を
`strip-chatlogs.ts` に実装する。

##### 受理ゲート(Phase 0 / R-001)

- 受理ゲートは対象ファイルの列挙より前に評価する
- 受理範囲の検査は共通の引数解析ではなく strip 側(`_assertAcceptedRange`)で行う(DD-04)。
  `filter` / `noise-filter` の既存挙動を変更しない
- **出力ディレクトリの指定を拒否する**(DR-32 決定 1)。`config.outputDir` が真値のとき
  `ChatlogError('InvalidArgs', 'OutputDirNotAllowed', ...)` を送出する。検査位置は `period` の必須
  検査の前とする。`--output-dir` フラグと第 3 位置引数の双方が同一フィールドへ格納されるため、
  検査は解析後の `config.outputDir` に対して行い、どちらの経路の値も同じゲートで拒否される
  (DR-32 決定 4)。通常モード / 復帰専用モードの双方で評価する(DR-32 決定 5、DR-23 決定 5 を継承)。
  `outputDir` は `resolveChatlogsDir` へ渡らず対象ディレクトリの解決に用いられないため、黙って
  受理すると出力先を変えたつもりの実行が対象ディレクトリを in-place で破壊的に書き換える
- **`inputDir` は拒否しない**(DR-38 決定 1)。`config.inputDir` は `resolveChatlogsDir` の
  `override` へ渡す。他スキル(`filter-chatlogs.ts` / `noise-filter-chatlogs.ts`)と同形にすること
- `period` の必須検査は `if (!config.inputDir && !config.period)` とする(DR-38 決定 2)。
  `override` 指定時は agent / period が対象の解決に使われないため、年月を必須とする根拠が成立しない

##### 列挙と事前検査(Phase 1 / R-016 / R-017)

- 列挙は再帰の `findFiles` で行う(R-017 / DR-39)。根拠は §4「Phase 1 の列挙が再帰である理由」
- 列挙の直後・`_stats.total` の設定より前に、拡張子を除くベース名の重複を検査する(R-016 / DR-40)。
  ベース名は `ChatlogCache._toHashKey` と同じ `getBasename` で求める。重複があれば
  `ChatlogError('FailFast', 'DuplicateBasename', ...)` を送出し、衝突したベース名と該当パスを
  すべてメッセージに含める。集計は `for` ではなく `reduce` で書く
- 孤立退避の検出(Commit 10)をこのフェーズで呼ぶ

##### ファイル処理パイプライン(Phase 2〜5 / DR-28)

- 実行フェーズ 2〜5 は `_processFiles` として 1 ファイル単位のパイプラインで実装する(DR-28 決定 1)。
  1 件あたりの責務は 3 関数へ分ける。`_classifyFile` が判定と副作用(書き込み・`passthrough` の
  キャッシュ記録 — DR-31 決定 4)の実行と分類、
  `_logFileOutcome` がログ出力、`_applyFileOutcome` が件数加算を担い、この順で 1 件ずつ呼ぶ
  (`recoverOrphans` の `_classifyRecovery` / `_logOutcome` / `_applyOutcome` と同じ形 —
  DR-28 決定 2)。実行は `runConcurrent(files, fn, config.concurrency)` で並列度を制限する
- `_classifyFile` は分類が `passthrough` のとき `_recordPassthrough` によりキャッシュへ記録する
  (DR-31 決定 1・4)。`status: 'passthrough'` と、成立した規則(R-005 または R-006)を `rule` として
  記録する。`rule` を `R-003` などで上書きすると、元が `stripped` だったか `passthrough` だったかの
  区別が失われる。`writeStripped`(Commit 8)は退避・差し替えを伴うため `passthrough` を扱わない
- `_recordPassthrough` の記録は通常実行に限る(DR-31 決定 5)。dry-run では `_classifyFile` の
  `!dryRun` ガードにより呼ばない
- 記録に失敗した場合は当該ファイルを error として計上する(DR-31 決定 3)。失敗が `ChatlogError`
  でない場合は `ChatlogError('FailFast', 'CacheWriteFailed', ...)` に包んで返す。`writeStripped` と
  同じく throw せず戻り値で返し、`runConcurrent` を reject させない
- `sweepBackups`(Phase 6)はループの外に置く(DR-28 決定 4)。dry-run 時は `_processFiles` が
  抑止する
- dry-run は `_processFiles` / `_classifyFile` / `classifyStrip` が `dryRun` を引数で受け取り、
  **1 ファイルごとに内部で分岐** する形で実現する(DR-28 / DR-29 決定 3)

`_classifyFile` の早期 return、`_logFileOutcome` の分岐基準、`sweepBackups` へ渡すパス集合の
基準、dry-run 宣言行の位置については §4「設計判断の記録」を参照する。

#### Commit 12: `feat(filter): add strip reporting`

実行フェーズの Phase 7(報告)と終了コードの決定を実装する。

##### 全件処理の判定と終了コード

- 全件処理の判定式(`stripped + skipped + done + passthrough == total` かつ `error == 0`)を
  確認する(DR-30)。R-014 の孤立退避は `.md` を持たず列挙されないため `total` に含まれない。
  当該 error は左辺の等式には現れず、`error == 0` の条件のみで捕捉される。2 条件の連言であるため
  判定式は成立し続ける。復帰専用モードでは strip を分類しないため本判定式を評価しない
- 終了コードは 0(成功)/ 1(非成功)の二値とする。非成功終了は `main()` の終端で `ChatlogError` を
  throw して `import.meta.main` ガードに委ねる(DR-20)。R-012 / R-013 に異なる値を与えない

##### 機械可読サマリー(REQ-F-006)

- 出力項目は REQ-F-006 が規定する。total / stripped / skipped / done / passthrough / error の件数
  (フィールド順は `stripped` の直後に `skipped`。DR-30)、除去前後の合計バイト数、`.bak` の削除有無
  (削除件数、または保持理由)を出力する
- シリアライズ形式は既存 `filter` / `noise-filter` の報告出力に倣う

##### ファイル単位の報告書式(DR-29 決定 5 / 6 / DR-37)

dry-run では 1 ファイルにつき 1 行の明細を `logger.dryrun` で出す。

```text
<path>: outcome=stripped (skip)
<path>: outcome=passthrough
<path>: outcome=done
<path>: outcome=error rule=R-002
```

- `skipped` は `stripped (skip)` と表示し、他の分類に `(skip)` は付けない
- `rule=` は `error` のときのみ出力する(R-002 と R-007 で原因が全く異なり、追跡の手がかりとなるため)
- `lines=` と `removedBytes=` は **全分類で出力しない**。6000 件規模で参照されるのは分類の一覧
  であり、1 件ごとの行範囲・バイト数は使われないため
- dry-run 明細の宣言行はループの外で 1 度だけ出す(DR-28 決定 6)

通常実行では `stripped` と `passthrough` を `logger.info` で `<分類>: <path>` の形で 1 件ごとに
出力する(DR-29 決定 6)。`done` は出力しません。再実行時には大半が `done` となり、出力が埋まって
その実行で実際に何が起きたかを読めなくするためです。判定 error(R-002 / R-007)と書き込み失敗は
いずれも `logger.error` で `<分類>: <path> (<詳細>)` の形で出力する(DR-37)。詳細は判定 error では
`rule=<規則 ID>`、書き込み失敗では `ChatlogError` のメッセージとする。R-002 の I/O エラー変種が
担ぐ `kind` / `subindex` は出力しない(dry-run 明細と粒度を揃えるため)。

##### 復帰専用モードの報告(R-015 / DR-33)

- 報告項目は復帰件数・復帰したパス・キャッシュ削除に失敗したパスとし、REQ-F-006 の分類件数は
  出力しない(分類を行わないため)
- `RecoverStats.error` が 1 件以上のとき、`_reportRecovery` による報告の **後** に `ChatlogError` を
  throw し終了コードを 1 とする(DR-33)。対象は復帰リネームの失敗とキャッシュエントリ削除の失敗
  (再試行の扱いは DR-27)の 2 経路で、種別を区別しない(DR-33 決定 1)
- 報告は終了コードの生成に先行する(DR-33 決定 2、DR-20 決定 3)。通常モードの退避一括削除の失敗が
  「サマリー行 → throw」の順であるのと同じ形である
- 終了コードは 0 / 1 の二値とし error の種別ごとに値を分けない(DR-33 決定 3、DR-20 決定 1)
- dry-run 用のガードは置かない。dry-run はリネームとキャッシュ削除をせず全件が `skipped` に
  分類されるため `RecoverStats.error` は構造上 0 のままであり、ガードは到達しない条件になる
  (DR-33 決定 4)
- DR-20 決定 4(`error` の件数は終了コードに影響しない)は破棄しない。同決定の適用範囲は
  `StripStats` と R-011 / R-012 を根拠とする通常モード(R-014)に限られ、本規定は復帰専用モード
  (R-015)の `RecoverStats` を条件とする別の統計である

#### Commit 13: `docs(filter): add strip subcommand to SKILL.md`

- `argument-hint` を `[noise-filter|filter|strip]` に拡張する
- strip の実行手順と deno 実行権限フラグを追記する
- `--recover-orphans` の用途と注意を明記する(DR-23)
  - 中断した実行の復旧に用いる復帰専用モードであり strip は行わないこと
  - strip するには結果を確認し、フラグ無しで再実行すること
  - 対象ディレクトリに無関係な `.bak` がある場合はそれも `.md` として復帰させるため破壊的に
    なりうること
- 再 export 後のキャッシュ消去が利用者の責任であることを明記する(requirements.md の既知の制約)。
  `export-chatlogs` を再実行して本体を未 strip の状態へ戻した場合、キャッシュの処理済み記録が
  残るため当該ファイルは strip されず、報告上は done として正常終了する。再 export した範囲に
  ついて `DEFAULT_CACHE_ROOT` 配下の該当エントリを削除する手順を記載する。`--recover-orphans` に
  よる復帰では strip が自動でキャッシュを削除するため(DR-24)、この手順は不要である旨も併記する

### 共有ライブラリのミラー

`skills/_cle-libs/` は `skills/setup-chatlogs/assets/_cle-libs/` にバイト一致でミラーされている。
`setup-chatlogs` はこの assets 側を配布するため、実装ステージ 1 の変更は **両ツリーに適用する**。

| Commit | 対象ファイル                            | ミラー先                                         |
| ------ | --------------------------------------- | ------------------------------------------------ |
| 1      | `libs/file-ops/backup-to-bak.ts` (新規) | `setup-chatlogs/assets/_cle-libs/libs/file-ops/` |
| 1      | `types/providers.types.ts`              | `setup-chatlogs/assets/_cle-libs/types/`         |
| 2      | `libs/file-io/write-utils.ts`           | `setup-chatlogs/assets/_cle-libs/libs/file-io/`  |
| 3      | `classes/ChatlogFrontmatter.class.ts`   | `setup-chatlogs/assets/_cle-libs/classes/`       |
| 4      | `libs/file-ops/backup-old-path.ts`      | `setup-chatlogs/assets/_cle-libs/libs/file-ops/` |

片側だけを更新すると `setup-chatlogs` が展開する共有ライブラリのみが古くなり、静かに壊れる。

---

## 3. Rule Coverage

実行フェーズ(Phase 0〜7)と判定規則(R-001〜R-017)の対応。全 17 規則がいずれか 1 つの
フェーズに属し、2 つのフェーズに現れる規則は無い。DR-28 以降、実行フェーズ 2〜5 は 1 ファイル
単位のパイプラインへ統合されているため、本表の「実行フェーズ」列は操作の順序を示すもので
あり、独立した実行単位ではありません。規則そのものと評価順序は不変です。

対応は「規則 → 分類」の一方向です。DR-15 の「分類は判定規則と 1 対 1 で対応する」は
DR-29 決定 3 により破棄された。R-008 が `dryRun` により `stripped` / `skipped` の 2 分類へ
分岐するためです。

| Rule  | 実行フェーズ | 分類 / 結果                                    | Commit      |
| ----- | ------------ | ---------------------------------------------- | ----------- |
| R-001 | 0            | 実行拒否 (出力ディレクトリの指定を含む。DR-32) | 11          |
| R-002 | 2            | error                                          | 7           |
| R-003 | 2            | done                                           | 7           |
| R-004 | 2            | done                                           | 7           |
| R-005 | 2            | passthrough (+ 記録。DR-31)                    | 7 / 11      |
| R-006 | 2            | passthrough (+ 記録。DR-31)                    | 7 / 11      |
| R-007 | 2            | error                                          | 7           |
| R-008 | 2            | stripped / skipped (dry-run)                   | 7           |
| R-009 | 3 / 4 / 5    | (副作用) REQ-NF-005 の 3 段階                  | 8           |
| R-010 | 6            | (副作用)                                       | 9           |
| R-011 | 6            | (副作用なし・保持)                             | 9           |
| R-012 | 6            | (報告・終了コード)                             | 9 / 12      |
| R-013 | 6            | (報告・終了コード)                             | 9 / 12      |
| R-014 | 1            | (通常モード・error 計上)                       | 10          |
| R-015 | 0 / 1 / 7    | (復帰専用モード・終了コード。DR-33)            | 10 / 12     |
| R-016 | 1            | 実行拒否 (`DuplicateBasename`。DR-40)          | 11          |
| R-017 | 1 / 6        | (走査範囲・3 経路へ同時適用。DR-39)            | 9 / 10 / 11 |

R-005 / R-006 が 2 commit にまたがるのは、判定(Commit 7 の `classifyStrip`)と、判定確定後の
キャッシュ記録(Commit 11 の `_classifyFile` / `_recordPassthrough`)が別の関数に属するためで
ある(DR-31 決定 4)。分類そのものは Phase 2 で確定しており、記録はその副作用にあたる。

R-009 が 3 フェーズにまたがるのは規則の重複ではない。R-009 が定めるのは操作の **順序** であり、
その順序を 3 段階として明示したものです。commit としては不可分の書き込みシーケンスのため
1 つにまとめる。

R-015 が 3 フェーズにまたがるのも重複ではない。復帰専用モードの実行経路そのもの(Phase 0 の
受理ゲート → Phase 1 の復帰 → Phase 7 の報告)を 1 つの規則が定めるためであり、Phase 2〜6 は
実行しない。

R-017 が 3 commit にまたがるのは、同一の走査方式を本体列挙(Commit 11)・孤立退避の検出
(Commit 10)・退避の一括削除(Commit 9)の 3 経路へ **同時に** 適用する規則だからです。
部分適用が禁じられる理由は §4 に記す。

---

## 4. 設計判断の記録

`strip-chatlogs.ts` の内部関数(`_` プレフィックス)が担う判断のうち、規則(R-NNN)・(REQ-\*)に
現れないものをここに記録する。コード側の JSDoc は要約と引数の説明のみを持ち、理由は本節を参照する。

Commit 節が「何を作るか」を述べるのに対し、本節は「なぜ他の形を採らなかったか」を述べる。

### `_reportSummary` — サマリー行の書式

件数とバイト数は `key=value` の羅列で出力し、桁区切りと単位を付けない。SKILL.md 層が `::info::`
行を解析して数値として読むためであり、`filter` / `noise-filter` の既存サマリーと同じ形である
(REQ-F-006 Rationale)。

### `_reportRecovery` — 復帰専用モードで dry-run に `完了` を出さない

SKILL.md 層は `完了（復帰専用）:` の行から件数を拾う。dry-run でも同じ語を出すと復帰が実行済みで
あると誤読されるため、dry-run は `復帰対象:` の行にとどめる。

あわせて REQ-F-006 の 5 分類件数も出力しない。分類していない以上、0 件のサマリーを出すと
「全件が done だった」実行と区別がつかなくなるためです。

### `_processOrphanErrors` — 検出結果を返さない理由

孤立退避の検出(R-014 / DR-23 決定 1)はパスの一覧を返さず、`stats.error` への加算と error ログの
出力だけを行う。後続フェーズが必要とするのは R-011 の保持ゲートを駆動する **件数** のみであり、
パスは報告以外に使い道がないためです。

### `_processRecovery` — 検出と復帰を同じ経路に通す理由

復帰専用モードは dry-run でも `recoverOrphans` を呼ぶ。検出のみを別経路で呼ぶと「復帰しなかった
件数」を導出できないため、件数の算出を 1 箇所へ集約する。

### `_classifyFile` — 書き込み経路へ入れるのは判定 `stripped` のみ

`if (_decision.outcome !== 'stripped') { return ... }` の早期 return は必須です。外すと
`done` / `error` / dry-run の `skipped` まで `writeStripped` へ流れ込む。

### `_logFileOutcome` — error 行に対象パスを出す理由

書き込み失敗の内容(`CacheWriteFailed` の detail 等)はキャッシュ層の生メッセージであり chatlog の
パスを含まない。失敗内容だけではどのファイルが失敗したか特定できず、R-011 の退避保持ゲートを
解除できない。

### `_logFileOutcome` — 分岐を分類で行う理由

分岐は **分類**(`outcome`)で行い、判定(`decision.outcome`)では行わない。書き込みに失敗した
ファイルは判定が `stripped` のまま分類が `error` となるため、判定を見ると書き込めなかった
ファイルを `stripped` として報告してしまう(`specifications/specifications.md`
「3.2 Output Semantics」節)。

### `_applyFileOutcome` — 加算は 1 ファイルにつき 1 フィールド

`error` に `stripped` を重ねて加算してはならない。重ねると 5 分類の総和が `total` を超え、
サマリーの整合検査が壊れる(DR-30 決定 2 とその Rationale)。

`stats.error` には孤立退避(Phase 1)の計上も乗り、孤立退避は `.md` を持たず `total` に含まれない。
したがって実行終了時に成立するのは 5 項の恒等式ではなく
`stripped + skipped + done + passthrough == total` かつ `error == 0` である(REQ-F-006 /
`specifications/specifications.md`「全件処理の判定 (DR-15 / DR-30)」節)。

### `_applyFileOutcome` と `_applyFileBytes` を分けて持つ理由

件数の加算は分類 5 値と件数フィールドが 1 対 1 に対応するため、分類名と同名のフィールドを加算する
だけでよい(DR-30)。一方バイト数は 5 分類のうち `stripped` / `skipped` の 2 分類だけが値を持つ
非対称な集計です。同じ関数へ混ぜると件数側の単純さが失われるため、関数を分ける。

バイト数の加算対象は **分類** が `stripped` / `skipped` のファイルに限る。判定ではない。書き込みに
失敗したファイルは判定が `stripped` のまま分類が `error` となるが、本体は置換されておらず 1 バイトも
除去されていない。計上すると実際には縮んでいない量を除去実績として報告することになる。
`sweepBackups` へ渡すパス集合が **判定** 基準である(R-013 / DR-28 決定 5)のとは基準が逆になる。

### `_processFiles` — 観測される順序

1 件ごとに `_classifyFile` → `_logFileOutcome` → `_applyFileOutcome` をこの順で呼ぶため、ログと
統計加算の順序は入力順ではなく **処理の完了順** になる。一方 `runConcurrent` は結果を入力位置へ
書き戻すため、戻り値の `decisions` は **入力と同順・同数** です。

### `_processFiles` — 守るべき不変条件

- `sweepBackups` へ渡す `stats.error` は、孤立退避(Phase 1)・判定 error・書き込み失敗の 3 者を
  含んだ確定値でなければならない。部分的な値を渡すと R-011 の保持ゲートが誤動作し、error が
  あるにもかかわらず `.bak` を削除して復旧材料を失う。`sweepBackups` をループの外に置くのは
  このためである(DR-28 決定 4)
- `sweepBackups` へ渡すパス集合は **判定** が `stripped` としたものであり、書き込みの成否で
  絞り込んではならない(R-013 / DR-28 決定 5)。分類基準へ「単純化」しても、書き込み失敗が
  `stats.error` を立てて R-011 の保持ゲートで戻るため、R-013 の包含検査へ到達せずテストでは
  検出できない
- dry-run の宣言行はループの外で 1 度だけ出す。内側に置くとファイル件数分重複し、かつ対象 0 件で
  消える(DR-28 決定 6)
- `sweepBackups` の error は throw せず返す。報告順序と終了コードの決定は `main` の責務(DD-03)。
  dry-run では常に `undefined` を返す

### Phase 1 の列挙が再帰である理由

`classify-chatlogs` は対象ディレクトリのログをプロジェクト別サブディレクトリへ移動する。
非再帰の `findFilesFlat` では classify 済みの対象で列挙件数が 0 件になるため、再帰列挙の
`findFiles` を使う(R-017 / DR-39)。

置き換えは本体の列挙・孤立退避の検出(`findOrphans`)・退避の一括削除(`sweepBackups`)の
3 箇所に **同時に** 適用する。部分適用は破壊的な中間状態を作る。

- 本体だけ再帰化すると、R-013 の包含検査がサブディレクトリの `stripped` に対応する退避を
  見つけられず全件不足と判定し、一括削除が恒久的に中止される
- 一括削除だけ再帰化すると、サブディレクトリの孤立退避が未検出のまま `error = 0` となり
  R-011 の保持ゲートを通過し、復旧材料である退避が削除される

注入 glob を用いるテストは、`findFiles` が内部で発行するディレクトリ列挙パターン
(`` `${dir}/*/` ``、`findDirectoriesFlat` 由来)にも応答しなければならない。パターンを見ずに
固定配列を返すモックはファイルをディレクトリとして扱い、探索が発散する。

---

## 5. Open Items

未確定の項目は無い。impl フェーズで確定させた 8 件はいずれも決着済みであり、根拠は該当 Commit 節
および DR-20(終了コードの二値化)/ DR-21(読み取り失敗の分類)/ DR-25(R-013 の退避パス比較)
に記載があります。機械可読出力の項目は REQ-F-006 が規定済みです。

---

## 6. Change History

<!-- SemVer: MAJOR = approach discarded, MINOR = decision criterion added,
     PATCH = clarification only. Keep frontmatter `version` equal to the newest row.
     `based-on` must cite a three-part version that exists in specifications.md.
     See deckrd-rule-document-versioning.md -->

<!-- markdownlint-disable line-length -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-13 | 1.0.0   | Initial implementation plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-13 | 1.1.0   | DR-17 を反映。Commit 1 の Provider を `backupPath` から `backupToBak` へ改め、既存 `.bak` 到達時を throw からスキップ + `null` へ変更。Commit 2 の戻り値を `Promise<string \| null>` に是正し、Commit 8 に `null` の扱いを追記。Commit 4 に「strip は `backupToBak` を用いる」旨を明記。共有ライブラリのミラー (setup-chatlogs/assets) への適用を新設。based-on を v3.5.0 へ更新                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-13 | 1.1.1   | fix レビュー指摘 4 件を反映。commit グループ化の軸の見出しを「Phase N」から「実装ステージ N」へ改め、実行フェーズ 0〜7 との番号衝突を解消 (T-01)。`BaseStats.skip` の語義引用を DR-15 の表記に合わせて是正 (T-02)。`phase-design-note.md` の版数参照を v1.6.1 から v1.6.2 へ訂正 (CR-01/S-02)。Open Items 表の「Windows での rename/move」の確定 Commit を本文の記載に合わせ 8 のみへ是正 (S-01)。振る舞い規則・commit 分割・決定内容の変更は伴わない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-13 | 1.2.0   | DR-21 を反映。Commit 7 に読み取り失敗の分類を記載し、`readTextFile` の `throwFileIoError: false` により I/O 起因は error 計上して継続、非 I/O は throw して中断する方針を確定。Open Items 表から「読み取り不可・権限エラー・走査中の消失の分類」を削除し決着済みへ移動                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-13 | 1.3.0   | 残る Open Item 4 件を確定し Open Items 表を空にした。Commit 9 に DR-22（R-013 の包含検査はファイル名部分を大小文字を区別せず比較）を反映。Commit 8 の一時ファイル衝突と Windows rename は既存 `writeTextFile` の `AlreadyExists` → remove → 再 rename で担保済みと明文化。Commit 10 の終了コードは DR-20、機械可読出力の項目は REQ-F-006 が規定済みと整理                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-13 | 1.4.0   | codex second opinion (impl) に対応し DR-23 を反映。Commit 10 の Phase 1 に孤立退避（`.md` を伴わない `.bak` / `.tmp`）の検出を追加し error 計上とする。あわせて Commit 8 の「Windows の rename は既存実装で担保済み」という記載を是正し、`AlreadyExists` の catch → remove → retry が原子的でないこと、および strip の経路では R-004 により到達しない想定であることを明記                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-13 | 1.5.0   | DR-23 の改訂を反映。Commit 10 に `--recover-orphans`（既定無効、`.bak` → `.md` 復帰、`.tmp` 単独は復帰せず error、`--dry-run` 併用時は復帰しない）を追加。Commit 11 に当該フラグの用途と破壊的になりうる旨の記載を追加                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-13 | 1.6.0   | DR-23 決定 3 の改訂を反映。`--recover-orphans` を復帰専用モード（Phase 0 → 復帰 → Phase 7 で終了、strip を行わない）に改め、Commit 10 の main 分岐・判定式・機械可読出力・Commit 11 の記載を復帰専用モードに合わせて更新                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-13 | 1.7.0   | 実行モードを spec へ昇格させたことに追随。based-on を specifications.md v3.6.0 へ更新し、DR-23 の内容が spec の R-014 / R-015 として規範化されたことを反映。Rule Coverage 表に R-014 / R-015 を追加（全 15 規則）、Section 1.1 の規則数を 15 個へ是正、R-015 が 3 フェーズにまたがる理由と `phase-design-note.md` の未記載を注記に追記                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-13 | 1.8.0   | codex review (PR #409) に対応し DR-24 / DR-25 を反映。Commit 9 の R-013 包含検査を、小文字化キーの集合比較から期待退避パスの実在確認（完全一致・大小文字の変換なし・追加 I/O なし）へ改める（DR-22 破棄）。Commit 10 の復帰専用モードに、復帰リネーム直後のキャッシュエントリ削除と失敗時の error 計上を追加。Open Items の R-013 正規化規則の記載を DR-25 の内容へ更新                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-16 | 2.0.0   | DR-27 / DR-28 / DR-29 を反映。DR-28 が「フェーズ境界は判定と副作用で切る」「dry-run は main が実行フェーズ 3〜6 を呼ばない形で実現する」を破棄したため、Section 1.1 と Commit 10 の当該記述を破棄済みとして記録し、1 ファイル単位のパイプライン(`_processFiles` + `runConcurrent`、責務は `_classifyFile` / `_logFileOutcome` / `_applyFileOutcome` の 3 関数)へ改める。`sweepBackups` はループ外、`strippedPaths` は判定基準のまま維持。Commit 5 に `StripConfig.concurrency`(既存スキーマ流用)と `STRIP_CACHE_DELETE_ATTEMPTS` / `STRIP_CACHE_DELETE_RETRY_WAIT_MS`(DR-27)を追加。DR-29 により Section 1.1 の分類を 5 値(`skipped` を追加、`StripStats` は 4 分類のまま)へ、Commit 7 を `libs/classify-strip.ts` の `classifyStrip(filePath, cache, dryRun, options?)`(cache 直受け・副作用なし・純粋関数ではない)へ改め、Commit 10 に dry-run 明細と通常実行の per-file 報告書式を追加。Rule Coverage 表の R-008 を `stripped / skipped` とし DR-15 の「分類と判定規則は 1 対 1」の破棄を注記。based-on を spec v4.0.0、Working Note 参照を v2.0.0、DR 範囲を DR-01〜DR-29 へ更新                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-16 | 3.0.0   | DR-30 を反映し DR-29 決定 3 のうち「件数は `StripStats.stripped` へ加算する」部分を破棄 (MAJOR: decided approach discarded)。Section 1.1 の「`StripStats` に `skipped` フィールドは無く統計サマリーは 4 分類」を破棄し、分類 5 値と統計 5 件数の 1 対 1 対応・`stripped` と `skipped` の排他へ改める。Commit 5 の `StripStats` のフィールドへ `skipped` を追加。Commit 10 の全件処理の判定式を `stripped + skipped + done + passthrough == total` へ、機械可読出力の項目を 5 分類 (`stripped` の直後に `skipped`) へ改訂。based-on を spec v5.0.0、Working Note 参照を v3.0.0、DR 範囲を DR-01〜DR-30 へ更新                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-16 | 3.1.0   | DR-31 を反映 (MINOR: 実装対象が確定した振る舞いの追加)。Commit 7 に R-003 の処理済み status を `stripped` / `passthrough` の 2 値とし `_PROCESSED_STATUSES` + `includes` で判定する旨を追加。Commit 8 に「`writeStripped` が記録するのは `stripped` (`rule` は `R-008`) のみ」を追加。Commit 10 に `_recordPassthrough` の規定 (`status: passthrough` と成立規則 R-005 / R-006 を `rule` に記録・dry-run では `!dryRun` ガードにより非記録・記録失敗は `CacheWriteFailed` として error に計上し throw しない) と `_classifyFile` の責務へのキャッシュ記録を追加。Commit 5 の `STRIP_CACHE_STATUSES` に `PASSTHROUGH` が実書き込み値となる旨を追記。Rule Coverage 表の R-005 / R-006 を Commit 7 / 10 とし理由を注記。based-on を spec v5.1.0、Working Note 参照を v3.1.0、DR 範囲を DR-01〜DR-31 へ更新                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-16 | 3.2.0   | DR-34 を反映 (MINOR: 実装対象が確定した振る舞いの追加)。Commit 9 に、削除の前に期待退避パスの集合に含まれない退避を件数とパスで警告報告する判断基準を追加。期待退避パスは R-013 の包含検査と同じ構成方法を用い、報告は判定・戻り値・終了コードを変えず、前回中断の残骸と外部由来を区別しない。`based-on` を specifications.md v5.4.0 へ更新 (v5.1.0 からの遅れを併せて解消)。削除範囲は不変                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-17 | 3.3.0   | 未反映だった DR-32 / DR-33 を反映 (MINOR: 実装対象が確定した振る舞いの追加)。Commit 10 の受理ゲートに `_assertAcceptedRange` による `outputDir` の拒否 (`ChatlogError('InvalidArgs', 'OutputDirNotAllowed')`、検査位置は `inputDir` の直後・`period` の必須検査の前、`--output-dir` と第 3 位置引数の双方、通常モード / 復帰専用モードの双方で評価) を追加 (DR-32)。同 Commit の復帰専用モードに、`RecoverStats.error` が 1 件以上のとき報告の後に `ChatlogError` を throw し終了コードを 1 とする規定を追加 (DR-33)。DR-20 決定 4 は破棄せず適用範囲を通常モード (R-014) に限ると明記。Rule Coverage 表の R-001 / R-015 に両 DR を注記。あわせて 3.1.0 / 3.2.0 で更新漏れとなっていた Section 1.2 の内部参照を実体へ揃える (specifications.md v5.1.0 → v5.4.0、requirements.md v8.1.0 → v8.5.0、DR-01〜DR-31 → DR-01〜DR-34、Working Note v3.1.0 → v3.2.0、Section 3 注記の v2.0.0 → v3.2.0)。規則そのものと評価順序は不変                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-18 | 3.4.0   | DR-35 を反映 (MINOR: 実装対象が確定した振る舞いの追加)。Commit 8 に `writeStripped` の除去範囲の事前検証 (frontmatter の有無・開始辺・終了辺・範囲の順序の 4 点、frontmatter の有無を独立した早期 return とする理由、`hasFrontmatter` を先に評価して `divideEntry` の throw を到達不能にすること、不整合時は `ChatlogError('FailFast', 'StaleDecision')` を戻り値で返すこと) と、frontmatter 行数の算出を `_cle-libs` の `frontmatterLines` として `classifyStrip` と共有する旨 (REQ-C-001) を追加。based-on を spec v5.5.0 へ更新。R-009 の 3 段の操作順序と Commit 分割は不変                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-18 | 3.4.1   | DR-36 を反映 (PATCH: 位置づけの明確化)。Commit 8 の `writeStripped` の除去範囲の事前検証 (DR-35) に、検証が書き込みの直前でありスワップ地点ではないため競合の窓が閉じないことと、その窓を単一書き手前提のもとで残余として受容することを追記。based-on を spec v5.6.0 へ更新。実装対象・Commit 分割・検証 4 点は不変                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-19 | 3.5.0   | DR-37 を反映 (MINOR: 実装対象が確定した振る舞いの追加)。Commit 10 の通常実行の per-file 報告に判定 error (R-002 / R-007) を追加し、`logger.error` で `<分類>: <path> (rule=<規則 ID>)` の形で 1 件ごとに出力することと、書き込み失敗と同じ分岐へ統合すること、`kind` / `subindex` を出力しないこと、分岐を分類 (`outcome`) で行うことを明記。based-on を spec v5.7.0 へ更新。Commit 分割と dry-run 明細の書式は不変                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-19 | 3.5.1   | `strip-chatlogs.ts` の内部関数の設計判断を Section 2 へ集約 (PATCH: 記述の移設のみ)。サマリー行に桁区切り・単位を付けない理由、復帰専用モードの dry-run に `完了` を出さない理由、`_applyFileOutcome` と `_applyFileBytes` を分ける理由とバイト数の加算が分類基準である理由、`_processFiles` の観測順序と不変条件、列挙が非再帰である理由、`_processOrphanErrors` が検出結果を返さない理由、`sweepBackups` へ渡すパス集合が判定基準である不変条件、復帰専用モードで分類件数を出さない理由、`_processRecovery` が検出と復帰を同じ経路に通す理由、`_classifyFile` の早期 return、`_logFileOutcome` の error 行にパスを出す理由と分岐を分類で行う理由、`_applyFileOutcome` の加算規則と不変条件を、コード側 JSDoc から移設して記録。実装対象・Commit 分割・決定内容はいずれも不変                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-21 | 3.6.0   | DR-38 / DR-39 / DR-40 を反映 (MINOR: 実装対象を追加)。Commit 10 の受理ゲートから `inputDir` の拒否を外し、`config.inputDir` を `resolveChatlogsDir` の `override` へ渡すこと・`period` の必須検査を `!inputDir && !period` とすること・列挙直後にベース名の重複を `getBasename` で検査して `DuplicateBasename` を送出することを追記。「Phase 1 の列挙が非再帰である理由」を「再帰である理由」へ差し替え、本体列挙・孤立退避の検出・退避の一括削除の 3 箇所への同時適用が必須である理由と、注入 glob が `${dir}/*/` に応答する必要があることを記録。`findFilesFlat` への言及を `findFiles` へ追随。based-on を specifications.md v6.0.0 へ更新                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-09-04 | 3.7.0   | 実装単位の再編と全面的な記述整理 (MINOR: Rule Coverage 表に規範的な 2 行を追加)。**実装単位**: Commit 10 を 10 (孤立退避の検出と復帰専用モード) / 11 (エントリポイント・受理ゲート・列挙・パイプライン) / 12 (報告と終了コード) へ分割し、旧 Commit 11 を 13 へ繰り下げ。Commit 1〜9 は不変。Section 2 冒頭に旧→新の対応表を追加し、`decision-records.md` 本文の旧番号での参照を解決可能にした。**規則**: Section 1.2 の規則数を 15 から 17 へ是正し、Rule Coverage 表へ R-016 (`DuplicateBasename`) / R-017 (再帰走査) の 2 行を追加。**誤りの是正**: 孤立退避の検出対象から `.tmp` を外し「`.tmp` 単独は復帰させず報告のみ」を削除 (DR-26 決定 1 / 2 が DR-23 決定 1 の当該部分と決定 4 を破棄済みであるにもかかわらず未反映だった)。`STRIP_CACHE_STATUSES` の配置を `types/cache.const.types.ts` から実体の `types/strip-cache-status.const.types.ts` へ是正。陳腐化した上流参照を実体へ更新 (specifications.md v5.4.0 → v6.0.0、requirements.md v8.5.0 → v9.0.0、DR-01〜DR-34 → DR-01〜DR-40、実装レビュー DR-27〜DR-34 → DR-26〜DR-40、Working Note v3.2.0 → v3.3.0)。**削除**: DR-28 による破棄済み方針の引用ブロック 2 箇所 (経緯は本表 2.0.0 が保持)、`phase-design-note.md` の表が R-013 を欠くという他文書への不備注記 (同ノートは既に本表を正本と指示済み)、Open Items の決着済み 8 項目の列挙を 1 段落へ圧縮。**重複の解消**: Commit 節と設計判断節に重複していた 4 点 (`_classifyFile` の早期 return、`_logFileOutcome` の分岐基準、`sweepBackups` へ渡すパス集合の基準、dry-run 宣言行の位置) を設計判断節へ集約し、Commit 節からは参照とした。**構成**: Section 1 を 1.1 目的と規模 / 1.2 設計の骨格 / 1.3 関連文書へ再構成し、内部関数の設計判断を Section 4 として独立させ、Commit 8 と新 Commit 10〜12 に小見出しを導入。文体を である 調へ統一。振る舞い規則・評価順序・決定内容はいずれも不変 |

<!-- markdownlint-enable line-length -->
