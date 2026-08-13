---
title: "Implementation Plan: filter strip"
based-on: specifications.md v3.6.0
status: Draft
version: 1.7.0
created: "2026-08-13"
---

<!-- textlint-disable
  ja-technical-writing/sentence-length -->

## 1. Overview

### 1.1 Purpose

`filter strip` を `filter-chatlogs` スキルの 3 つ目のサブコマンドとして追加する。
エクスポート済みチャットログ Markdown の冒頭にある set-frontmatter 由来の定型プロンプト部を
in-place で除去し、実質的な会話内容のみを残す。
除去範囲は本文先頭から最初の `## Summary` の直前までとする。

対象規模は claude/2026-07 の 11671 件(275.3MB)、うち除去対象 6398 件。6000 件規模の破壊的な in-place
書き換えを伴う。したがって設計原則は「除去してよい根拠が積極的に確認できた場合のみ除去する」という
保守側に倒したものとする。

各入力ファイルは相互排他な 4 分類(stripped / done / passthrough / error)のいずれかになる。加えて受理
範囲外の起動は実行そのものを拒否する(R-001)。

判定規則は R-001〜R-015 の 15 個で構成され、評価順序を変更しない(R-014 / R-015 は実行モードを定める
規則であり、ファイル単位のカスケードには含まれない)。境界検出は行頭完全一致による
`^## Summary$` / `^## TOPICS ASSIGNMENT RULES$` の 2 文字列で行い、Markdown 構文解析は行わない。

フェーズ境界は「判定と副作用」で切る。安全弁(R-002 と R-007)が同一カスケードの中に位置し、仕様が
評価順序の変更を禁じるため、独立フェーズへの分割はカスケードの分断・二重化を招く。この方針は DR-15 が
定めた「分類ロジックは単一の判定関数に閉じ、副作用の有無のみを呼び出し側で分岐する」という制約と一致
する。

### 1.2 Reference

- Prior Art / Reference PR: なし(strip の実装コードは未着手)。関連 issue は `cle-2rf`
  (`P2` / `feature` / `in_progress`)。issue の Design と受け入れ基準は DR-02 と矛盾したままであり、spec の
  Open Question 1 として記録されている。
- 定型部テンプレートの正本: `.config/chatlog-exporter/prompts/meta.yaml` の 26 行目に
  `## TOPICS ASSIGNMENT RULES` が存在する
- Working Note: `implementation/phase-design-note.md` v1.6.2。
  Phase 0〜7 の分解・規則網羅性検証・型/定数配置・dry-run 逸脱の根拠を確定済み。
  本ドキュメントはこのノートを Phase 分解として採用する。ノートは削除・改変せず併存させる。
- Specifications: `specifications/specifications.md` v3.6.0(based-on: requirements.md v6.0.0)、
  `decision-records.md`(DR-01〜DR-23)、codex risk レビュー / codex second opinion (impl)

---

## 2. Implementation Plan

実行フェーズ(実行順序、Phase 0〜7)と commit(層によるグループ化)は異なる軸で管理する。実行フェーズ
3/4/5 は不可分の書き込みシーケンスのため 1 commit にまとめる。

以下の見出しの「実装ステージ」は commit をグループ化する軸であり、実行フェーズ 0〜7 とは番号空間が
異なる。

### 実装ステージ 1: `_cle-libs` 基盤拡張(下位レイヤ・先行必須)

#### Commit 1: `feat(cle-libs): add BackupProvider type and backupToBak`

- `BackupProvider` 型を `types/providers.types.ts` に追加する
- `libs/file-ops/backup-to-bak.ts` に `<name>.md` を `<name>.md.bak` へリネームする Provider を実装する
- 戻り値は `Promise<string | null>` とし、`BackupProvider` 型と厳密に一致させる(DR-17)
- 既存 `.bak` があるファイルはリネームをスキップし `null` を返す。例外は throw しない。
  連番・世代管理は持たない
- ミラー: `skills/setup-chatlogs/assets/_cle-libs/libs/file-ops/` にも同一内容で配置する
  (下記「共有ライブラリのミラー」参照)

#### Commit 2: `feat(cle-libs): support BackupProvider in writeTextFile`

- `writeTextFile` の第 3 引数に `BackupProvider` を追加する
- tmp 書き出し → 退避 → 差し替えの 3 ステップを行い、退避先パス、または退避を作成しなかった場合は
  `null` を返す(`Promise<string | null>`、REQ-NF-005 / DR-03 決定 4 のコード例どおり)
- 未指定時は現行と同一の挙動を維持する
- ミラー: `skills/setup-chatlogs/assets/_cle-libs/libs/file-io/write-utils.ts` にも適用する

#### Commit 3: `feat(cle-libs): add frontmatter identity comparison`

- `ChatlogFrontmatter` に 2 つの frontmatter の同一性を判定する手段を追加する
- キー集合と各キーの値を比較し、キーの出現順序は比較対象に含めない(AC-024)
- 値は `string` / `string[]` のいずれかであり、`string[]` は長さと各要素を順に比較する
- 既存メソッドの挙動は変更せず追加のみとする

#### Commit 4: `refactor(cle-libs): widen backupOldPath return type`

- `backupOldPath` の戻り値を `Promise<string | null>` に拡張する
- 連番セマンティクス(`.old-NN.md`)は維持する
- **strip が用いる退避は Commit 1 の `backupToBak` であり `backupOldPath` ではない**(DR-17)。
  本 commit の拡張は `BackupProvider` 型への適合のみを目的とし、strip の振る舞いには影響しない
- 唯一の本番呼び出し `normalize-chatlogs/scripts/modules/segment-io.ts:167` は戻り値を使用して
  いないため後方互換である
- ミラー: `skills/setup-chatlogs/assets/_cle-libs/libs/file-ops/backup-old-path.ts` にも適用する

### 実装ステージ 2: strip の型・定数

#### Commit 5: `feat(filter): add strip constants and types`

- `constants/strip.constants.ts` に `STRIP_BOUNDARY_HEADING` と `STRIP_TEMPLATE_MARKER` を定義する
- `types/strip.types.ts` に判定結果の型を新設する。
  フィールドは `outcome` / `reason` / `removalStartLine` / `removalEndLine` / `removedBytes`
- `types/stats.types.ts` に `StripStats` を追加する。フィールドは
  `{ total, stripped, done, passthrough, error }` とし、`BaseStats` を継承しない。
  `BaseStats.skip` は「dry-run/report 等により判定・削除の実行自体を行わなかった数」を意味し、モード
  非依存の `done` と衝突する
  (DR-15 が Option D として却下した命名)
- `types/cache.types.ts` に `StripCache`、`types/cache.const.types.ts` に `STRIP_CACHE_STATUSES` を
  追加する

### 実装ステージ 3: 判定ロジック(純粋関数・テスト量が最大)

#### Commit 6: `feat(filter): add strip boundary detection`

- 行頭完全一致による `## Summary` と定型部マーカーの検出を実装する
- Markdown 構文を解析しない。コードフェンス内・引用内・リスト内であるかは解釈しない
- 改行分割後の比較単位を確定する(CRLF / LF の双方で同一の検出結果になること)

#### Commit 7: `feat(filter): add strip classification cascade`

- R-002 から R-008 のカスケードを単一の純粋関数として実装する
- 判定結果として `outcome` / `reason`(該当規則 ID)/ 除去範囲の開始行・終了行 / 除去バイト数を返す
- R-007 の安全弁(除去後が空、除去率 99% 超)を関数内部に含める
- 除去率は除去バイト数 ÷ 本文バイト数(frontmatter を除く)で算出する
- 読み取りは `readTextFile(path, { throwFileIoError: false })` で行う(DR-21)。I/O 起因のエラー
  (`isFileIoError` が `true`)は error に計上して継続し、`reason` に `kind` / `subindex` / パスを
  記録する。I/O 起因でないエラーは再 throw されたものをそのまま伝播させ実行を中断する
  (DR-20 決定 2 の経路)。`PermissionDenied` / `Busy` は I/O 起因のため継続側とする

### 実装ステージ 4: 副作用と実行フロー

#### Commit 8: `feat(filter): add strip write pipeline`

- 実行フェーズの Phase 3 / 4 / 5 を実装する(tmp 書き出し → 退避 → 差し替え → キャッシュ記録)
- `writeTextFile` が返す `null` は「退避を作成しなかった」を意味し、**書き込みは成立している** ため
  error として計上しない(DR-17)。R-004 により既存 `.bak` を持つファイルは done として除かれるため
  実際には観測されない想定だが、観測されても処理を継続する
- キャッシュへの記録は差し替えの成立後に行う(差し替え失敗を処理済みと記録すると、次回 R-003 で
  done となり strip されないまま残るため)
- 一時ファイルの衝突は既存 `writeTextFile` の挙動を維持する。`Deno.rename` が
  `Deno.errors.AlreadyExists` で失敗した場合は差し替え先を `Deno.remove` してから再度 rename する
  (`write-utils.ts:33-39`)。`<name>.md.tmp` の残骸は上書きされ、エラーとしない。Commit 2 で第 3 引数を
  追加する際もこのハンドリングを変更しない
- Windows における rename の同一ボリューム制約は構造上満たされる。一時ファイルは `outputPath + '.tmp'`
  であり差し替え先と同一ディレクトリのため
- ただし `AlreadyExists` の catch → remove → retry は **原子的でない**。remove と rename の間で中断
  すると `.md` が存在しない状態が残る。strip の経路ではこの分岐に到達しない想定である
  (`backupToBak` が `<name>.md` を `.bak` へリネームした後は差し替え先が存在しないため)。
  到達しうるのは `backupToBak` が `null` を返した場合、すなわち既存 `.bak` ありで本体がリネーム
  されなかった場合に限られる。
  その状況は R-004 により done として除かれ書き込み自体に至らない。
  この分岐に到達した場合、当該実行の `.bak` は存在しないため、中断すると REQ-NF-005 の保証は
  成立しない。防御的に、到達した場合は error として計上し書き込みを行わない

#### Commit 9: `feat(filter): add strip backup sweep`

- 実行フェーズの Phase 6 を実装する(R-010 / R-011 / R-012 / R-013)
- 削除の前に退避の包含関係を検査する
  (`{ stripped と判定したファイルのパス } ⊆ { 存在する退避のパス }`)
- 包含検査の比較は `normalizePath` を適用したうえでファイル名部分を大小文字を区別せずに行う
  (DR-22)。比較用のキーは正規化済みパスを小文字化して生成し、キー生成は検査の内部に閉じる。
  `normalizePath` はドライブレターを大文字化する一方ファイル名部分の大小文字は変換せず、Windows の
  ファイルシステムは大小を区別しないため、原形のまま比較すると実体が存在しても「不足」と誤判定する
- 不足として報告するパスは小文字化したキーではなく stripped 側が保持する原形を出力する(DR-22)
- 削除は全件について試行し、1 件の失敗で残りを中断しない
- 削除に失敗した退避は件数とパスを報告し、終了コードを成功以外とする

#### Commit 10: `feat(filter): add strip entry point`

- 実行フェーズの Phase 0(受理ゲート)/ Phase 1(列挙・キャッシュ)/ Phase 7(報告)を実装する
- 受理ゲートは対象ファイルの列挙より前に評価する(R-001)
- Phase 1 で孤立した退避を検出する(DR-23 決定 1)。対象ディレクトリ配下に `<name>.md` を伴わない
  `<name>.md.bak` または `<name>.md.tmp` が存在する場合、当該 `<name>` を error として計上し、
  パスを報告に含める(`--recover-orphans` 無指定時)。列挙は `findFilesFlat` が `*.md` を glob する
  ため中断したファイルは列挙されず、R-002〜R-008 のいずれにも到達しない。検出しないと error 0 件の
  まま Phase 6 に到達し、DR-08 の一括削除で復旧材料の `.bak` が失われる。本検出はカスケードの
  外側に置き、R-002〜R-008 とその評価順序は変更しない
- `--recover-orphans` フラグを追加する(DR-23 決定 3)。既定は無効。**指定時は復帰専用モードとして
  動作する**。孤立退避のうち `<name>.md.bak` を `<name>.md` へリネームして復帰させ、そこで実行を
  終了する。復帰したファイルへの strip は行わず、R-002〜R-013 のいずれも評価せず、実行フェーズ
  2〜6 に進まない。復帰件数と対象パスを報告する。
  strip するには利用者が結果を確認し、フラグ無しで再実行する。
  スキーマは `args-schema.types.ts` の `flag` 型で定義し、strip 側のスキーマに追加する
  (`filter` / `noise-filter` の引数解析は変更しない — DD-04)
- 復帰専用モードでは main の分岐を Phase 0 → 復帰 → Phase 7(報告)とする。フェーズ内部に
  `if (recoverOrphans)` を置かない(dry-run と同じ方針)
- 復帰の対象は `.bak` が存在する場合に限る(DR-23 決定 4)。`.tmp` のみが残る場合は復帰させず報告
  のみとする。`.bak` と `.tmp` が併存する場合は `.bak` を採用し `.tmp` は残置して報告する
- 復帰専用モードでも Phase 0 の受理ゲート(R-001)は評価する(DR-23 決定 5)。対象ディレクトリの特定に
  `<agent> <YYYY-MM>` が必要なため。`--dry-run` と併用された場合は復帰せず、対象件数とパスの報告にとどめる
- 決定 1 の error 計上と復帰専用モードは排他である。`--recover-orphans` 指定時は通常の strip 処理が
  走らないため孤立退避の error 計上は行わない。フラグ無指定時のみ error として計上する
- 受理範囲の検査は共通の引数解析ではなく strip 側で行う(DD-04)。`filter` / `noise-filter` の既存
  挙動を変更しない
- dry-run は main が実行フェーズ 3〜6 を呼び出さない形で実現する。フェーズ内部に `if (dryRun)` を置かない
  (レビュー指摘 F-04 への対応。既存 filter モードの dry-run に倣ってはならない)
- 全件処理の判定式(`stripped + done + passthrough == total` かつ `error == 0`)を確認する。
  DR-23 の孤立退避は `.md` を持たず列挙されないため `total` に含まれない。当該 error は左辺の
  等式には現れず、`error == 0` の条件のみで捕捉される。2 条件の連言であるため判定式は成立し続ける。
  復帰専用モードでは strip を分類しないため本判定式を評価しない
- 終了コードは 0(成功)/ 1(非成功)の二値とする。
  非成功終了は `main()` の終端で `ChatlogError` を throw して `import.meta.main` ガードに委ねる(DR-20)。
  R-012 / R-013 に異なる値を与えない
- 機械可読出力の項目は REQ-F-006 が規定する。total / stripped / done / passthrough / error の件数、
  除去前後の合計バイト数、`.bak` の削除有無(削除件数、または保持理由)を出力する。
  シリアライズ形式は既存 `filter` / `noise-filter` の報告出力に倣う。
  復帰専用モードの報告は復帰件数・復帰したパス・復帰しなかった孤立退避(`.tmp` 単独)のパスとし、
  REQ-F-006 の分類件数は出力しない(分類を行わないため)

#### Commit 11: `docs(filter): add strip subcommand to SKILL.md`

- `argument-hint` を `[noise-filter|filter|strip]` に拡張する
- strip の実行手順と deno 実行権限フラグを追記する
- `--recover-orphans` の用途と注意を明記する(DR-23)。
- 中断した実行の復旧に用いる復帰専用モードであり strip は行わないこと。
- strip するには結果を確認し、フラグ無しで再実行すること。
  および、対象ディレクトリに無関係な `.bak` がある場合はそれも `.md` として復帰させるため破壊的になりうること

### 共有ライブラリのミラー

`skills/_cle-libs/` は `skills/setup-chatlogs/assets/_cle-libs/` にバイト一致でミラーされている。
(`backup-old-path.ts` / `write-utils.ts` は両ツリーに同一内容で存在することを確認済み)。
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

実行フェーズ(Phase 0〜7)と判定規則(R-001〜R-015)の対応。全 15 規則がいずれか 1 つのフェーズに属し、
2 つのフェーズに現れる規則は無い。

| Rule  | 実行フェーズ | 分類 / 結果                   | Commit |
| ----- | ------------ | ----------------------------- | ------ |
| R-001 | 0            | 実行拒否                      | 10     |
| R-002 | 2            | error                         | 7      |
| R-003 | 2            | done                          | 7      |
| R-004 | 2            | done                          | 7      |
| R-005 | 2            | passthrough                   | 7      |
| R-006 | 2            | passthrough                   | 7      |
| R-007 | 2            | error                         | 7      |
| R-008 | 2            | stripped                      | 7      |
| R-009 | 3 / 4 / 5    | (副作用) REQ-NF-005 の 3 段階 | 8      |
| R-010 | 6            | (副作用)                      | 9      |
| R-011 | 6            | (副作用なし・保持)            | 9      |
| R-012 | 6            | (報告・終了コード)            | 9      |
| R-013 | 6            | (報告・終了コード)            | 9      |
| R-014 | 1            | (通常モード・error 計上)      | 10     |
| R-015 | 0 / 1 / 7    | (復帰専用モード)              | 10     |

R-009 が 3 フェーズにまたがるのは規則の重複ではない。R-009 が定めるのは操作の **順序** であり、
その順序を 3 段階として明示したもの。commit としては不可分の書き込みシーケンスのため 1 つにまとめる。

R-015 が 3 フェーズにまたがるのも重複ではない。復帰専用モードの実行経路そのもの(Phase 0 の受理
ゲート → Phase 1 の復帰 → Phase 7 の報告)を 1 つの規則が定めるためであり、Phase 2〜6 は実行しない。

> **注記**: `phase-design-note.md` v1.6.2 の Section 4「規則の網羅性検証」の表は R-001〜R-012 の
> 12 行しか持たず、DR-16 で追加された R-013 が漏れている(同ノートの本文と Change History はいずれも
> 「13 規則」と述べており、表側の記載漏れ)。加えて DR-23 で追加された R-014 / R-015 も同ノートには
> 存在しない。本表がこれらを補正する。

---

## 4. Open Items

impl フェーズで確定させる項目。振る舞い規則ではなく実装詳細のため、spec の Open Questions には追加しない。

未確定の項目は無い。当初の 5 件はすべて下記に決着済みとして記録した。

決着済みで再検討しないもの:

- キャッシュのキー設計 — `ChatlogCache` 既存仕様どおり basename のみとする。内容ハッシュ等による
  identity 強化は行わない(REQ-C-001 の既存実装優先、REQ-C-008 の単一ディレクトリ限定が根拠)
- Markdown 見出し判定の厳密性 — REQ-C-004 が行頭完全一致・構文解析なしを規定済み
- 除去率閾値 — 固定値 99% のまま据え置き(実測最大 96.23%)
- AC-024 の判定基準 — `ChatlogFrontmatter` による同一性比較
- 読み取り不可・権限エラー・走査中の消失の分類 — DR-21 で確定。エラーの種類で切り分け、I/O 起因は
  error 計上して継続、非 I/O は throw して中断する
- 一時ファイルの衝突時動作 — 既存 `writeTextFile` の `AlreadyExists` → remove → 再 rename を維持する
  (Commit 8)。新たな決定を要さず、既存契約の明文化にとどまる
- Windows での rename の原子性・同一ボリューム — 一時ファイルが差し替え先と同一ディレクトリであるため
  構造上満たされる。POSIX との差異は上記の catch が吸収する(Commit 8)
- R-013 の退避パス比較の正規化規則 — DR-22 で確定。`normalizePath` 適用後、比較時のみファイル名部分を
  大小文字を区別せずに突き合わせる。報告は原形のパスを用いる
- 終了コードの具体値 — DR-20 で確定済み(0 / 1 の二値)。機械可読出力の項目は REQ-F-006 が規定済みで
  あり、impl で新たに決めるものは無い

---

## 5. Change History

<!-- SemVer: MAJOR = approach discarded, MINOR = decision criterion added,
     PATCH = clarification only. Keep frontmatter `version` equal to the newest row.
     `based-on` must cite a three-part version that exists in specifications.md.
     See deckrd-rule-document-versioning.md -->

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-13 | 1.0.0   | Initial implementation plan                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-13 | 1.1.0   | DR-17 を反映。Commit 1 の Provider を `backupPath` から `backupToBak` へ改め、既存 `.bak` 到達時を throw からスキップ + `null` へ変更。Commit 2 の戻り値を `Promise<string \| null>` に是正し、Commit 8 に `null` の扱いを追記。Commit 4 に「strip は `backupToBak` を用いる」旨を明記。共有ライブラリのミラー (setup-chatlogs/assets) への適用を新設。based-on を v3.5.0 へ更新                                                                      |
| 2026-08-13 | 1.1.1   | fix レビュー指摘 4 件を反映。commit グループ化の軸の見出しを「Phase N」から「実装ステージ N」へ改め、実行フェーズ 0〜7 との番号衝突を解消 (T-01)。`BaseStats.skip` の語義引用を DR-15 の表記に合わせて是正 (T-02)。`phase-design-note.md` の版数参照を v1.6.1 から v1.6.2 へ訂正 (CR-01/S-02)。Open Items 表の「Windows での rename/move」の確定 Commit を本文の記載に合わせ 8 のみへ是正 (S-01)。振る舞い規則・commit 分割・決定内容の変更は伴わない |
| 2026-08-13 | 1.2.0   | DR-21 を反映。Commit 7 に読み取り失敗の分類を記載し、`readTextFile` の `throwFileIoError: false` により I/O 起因は error 計上して継続、非 I/O は throw して中断する方針を確定。Open Items 表から「読み取り不可・権限エラー・走査中の消失の分類」を削除し決着済みへ移動                                                                                                                                                                                |
| 2026-08-13 | 1.3.0   | 残る Open Item 4 件を確定し Open Items 表を空にした。Commit 9 に DR-22（R-013 の包含検査はファイル名部分を大小文字を区別せず比較）を反映。Commit 8 の一時ファイル衝突と Windows rename は既存 `writeTextFile` の `AlreadyExists` → remove → 再 rename で担保済みと明文化。Commit 10 の終了コードは DR-20、機械可読出力の項目は REQ-F-006 が規定済みと整理                                                                                             |
| 2026-08-13 | 1.4.0   | codex second opinion (impl) に対応し DR-23 を反映。Commit 10 の Phase 1 に孤立退避（`.md` を伴わない `.bak` / `.tmp`）の検出を追加し error 計上とする。あわせて Commit 8 の「Windows の rename は既存実装で担保済み」という記載を是正し、`AlreadyExists` の catch → remove → retry が原子的でないこと、および strip の経路では R-004 により到達しない想定であることを明記                                                                             |
| 2026-08-13 | 1.5.0   | DR-23 の改訂を反映。Commit 10 に `--recover-orphans`（既定無効、`.bak` → `.md` 復帰、`.tmp` 単独は復帰せず error、`--dry-run` 併用時は復帰しない）を追加。Commit 11 に当該フラグの用途と破壊的になりうる旨の記載を追加                                                                                                                                                                                                                                |
| 2026-08-13 | 1.6.0   | DR-23 決定 3 の改訂を反映。`--recover-orphans` を復帰専用モード（Phase 0 → 復帰 → Phase 7 で終了、strip を行わない）に改め、Commit 10 の main 分岐・判定式・機械可読出力・Commit 11 の記載を復帰専用モードに合わせて更新                                                                                                                                                                                                                              |
| 2026-08-13 | 1.7.0   | 実行モードを spec へ昇格させたことに追随。based-on を specifications.md v3.6.0 へ更新し、DR-23 の内容が spec の R-014 / R-015 として規範化されたことを反映。Rule Coverage 表に R-014 / R-015 を追加（全 15 規則）、Section 1.1 の規則数を 15 個へ是正、R-015 が 3 フェーズにまたがる理由と `phase-design-note.md` の未記載を注記に追記                                                                                                                |
