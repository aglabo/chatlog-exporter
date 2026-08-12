---
title: "Implementation Plan: filter strip"
based-on: specifications.md v3.4.1
status: Draft
version: 1.0.0
created: "2026-08-13"
---

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

判定規則は R-001〜R-013 の 13 個で構成され、評価順序は変更しない。境界検出は行頭完全一致による
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
- Working Note: `implementation/phase-design-note.md` v1.6.1。
  Phase 0〜7 の分解・規則網羅性検証・型/定数配置・dry-run 逸脱の根拠を確定済み。
  本ドキュメントはこのノートを Phase 分解として採用する。ノートは削除・改変せず併存させる。
- Specifications: `specifications/specifications.md` v3.4.1(based-on: requirements.md v5.3.1)、
  `decision-records.md`(DR-01〜DR-16)、codex risk レビュー

---

## 2. Implementation Plan

実装フェーズ(実行順序、Phase 0〜7)と commit(層によるグループ化)は異なる軸で管理する。Phase 3/4/5 は
不可分の書き込みシーケンスのため 1 commit にまとめる。

### Phase 1: `_cle-libs` 基盤拡張(下位レイヤ・先行必須)

#### Commit 1: `feat(cle-libs): add BackupProvider type and backupPath`

- `BackupProvider` 型を `types/providers.types.ts` に追加する
- `libs/file-ops/backup-path.ts` に `<name>.md` を `<name>.md.bak` へリネームする Provider を実装する
- 戻り値は `Promise<string>` とし `null` を返さない(DR-12)
- 既存 `.bak` があるファイルは R-004 により呼び出し前にスキップされるため、退避を作成しない状況には
  到達しない。到達した場合は前提の破れとして例外を throw する

#### Commit 2: `feat(cle-libs): support BackupProvider in writeTextFile`

- `writeTextFile` の第 3 引数に `BackupProvider` を追加する
- tmp 書き出し → 退避 → 差し替えの 3 ステップを行い、退避先パスを返す(REQ-NF-005)
- 未指定時は現行と同一の挙動を維持する

#### Commit 3: `feat(cle-libs): add frontmatter identity comparison`

- `ChatlogFrontmatter` に 2 つの frontmatter の同一性を判定する手段を追加する
- キー集合と各キーの値を比較し、キーの出現順序は比較対象に含めない(AC-024)
- 値は `string` / `string[]` のいずれかであり、`string[]` は長さと各要素を順に比較する
- 既存メソッドの挙動は変更せず追加のみとする

#### Commit 4: `refactor(cle-libs): widen backupOldPath return type`

- `backupOldPath` の戻り値を `Promise<string | null>` に拡張する
- 連番セマンティクス(`.old-NN.md`)は維持する

### Phase 2: strip の型・定数

#### Commit 5: `feat(filter): add strip constants and types`

- `constants/strip.constants.ts` に `STRIP_BOUNDARY_HEADING` と `STRIP_TEMPLATE_MARKER` を定義する
- `types/strip.types.ts` に判定結果の型を新設する。
  フィールドは `outcome` / `reason` / `removalStartLine` / `removalEndLine` / `removedBytes`
- `types/stats.types.ts` に `StripStats` を追加する。フィールドは
  `{ total, stripped, done, passthrough, error }` とし、`BaseStats` を継承しない。
  `BaseStats.skip` は「dry-run により実行しなかった数」を意味し、モード非依存の `done` と衝突する
  (DR-15 が Option D として却下した命名)
- `types/cache.types.ts` に `StripCache`、`types/cache.const.types.ts` に `STRIP_CACHE_STATUSES` を
  追加する

### Phase 3: 判定ロジック(純粋関数・テスト量が最大)

#### Commit 6: `feat(filter): add strip boundary detection`

- 行頭完全一致による `## Summary` と定型部マーカーの検出を実装する
- Markdown 構文を解析しない。コードフェンス内・引用内・リスト内であるかは解釈しない
- 改行分割後の比較単位を確定する(CRLF / LF の双方で同一の検出結果になること)

#### Commit 7: `feat(filter): add strip classification cascade`

- R-002 から R-008 のカスケードを単一の純粋関数として実装する
- 判定結果として `outcome` / `reason`(該当規則 ID)/ 除去範囲の開始行・終了行 / 除去バイト数を返す
- R-007 の安全弁(除去後が空、除去率 99% 超)を関数内部に含める
- 除去率は除去バイト数 ÷ 本文バイト数(frontmatter を除く)で算出する
- 読み取り不可・権限エラー・走査中に消えたファイルの分類を確定する(OPEN ITEM、本 Commit で確定)

### Phase 4: 副作用と実行フロー

#### Commit 8: `feat(filter): add strip write pipeline`

- 実行フェーズの Phase 3 / 4 / 5 を実装する(tmp 書き出し → 退避 → 差し替え → キャッシュ記録)
- キャッシュへの記録は差し替えの成立後に行う(差し替え失敗を処理済みと記録すると、次回 R-003 で
  done となり strip されないまま残るため)
- 一時ファイルが既に存在する場合の動作を確定する(OPEN ITEM、本 Commit で確定)
- Windows における rename の原子性と同一ボリューム制約への対処を確定する(OPEN ITEM、本 Commit で確定)

#### Commit 9: `feat(filter): add strip backup sweep`

- 実行フェーズの Phase 6 を実装する(R-010 / R-011 / R-012 / R-013)
- 削除の前に退避の包含関係を検査する
  (`{ stripped と判定したファイルのパス } ⊆ { 存在する退避のパス }`)
- 包含検査におけるパス比較の正規化規則を確定する(OPEN ITEM、本 Commit で確定)。
  `normalizePath` はドライブレターを大文字化する一方、ファイル名部分の大小文字は変換しない。
  Windows のファイルシステムは大小を区別しないため、実体が存在しても「不足」と誤判定しうる
- 削除は全件について試行し、1 件の失敗で残りを中断しない
- 削除に失敗した退避は件数とパスを報告し、終了コードを成功以外とする

#### Commit 10: `feat(filter): add strip entry point`

- 実行フェーズの Phase 0(受理ゲート)/ Phase 1(列挙・キャッシュ)/ Phase 7(報告)を実装する
- 受理ゲートは対象ファイルの列挙より前に評価する(R-001)
- 受理範囲の検査は共通の引数解析ではなく strip 側で行う(DD-04)。`filter` / `noise-filter` の既存
  挙動を変更しない
- dry-run は main が Phase 3〜6 を呼び出さない形で実現する。フェーズ内部に `if (dryRun)` を置かない
  (レビュー指摘 F-04 への対応。既存 filter モードの dry-run に倣ってはならない)
- 全件処理の判定式(`stripped + done + passthrough == total` かつ `error == 0`)を確認する
- 終了コードの具体値と機械可読出力のスキーマを確定する(OPEN ITEM、本 Commit で確定)

#### Commit 11: `docs(filter): add strip subcommand to SKILL.md`

- `argument-hint` を `[noise-filter|filter|strip]` に拡張する
- strip の実行手順と deno 実行権限フラグを追記する

---

## 3. Rule Coverage

実行フェーズ(Phase 0〜7)と判定規則(R-001〜R-013)の対応。全 13 規則がいずれか 1 つのフェーズに属し、
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

R-009 のみ 3 フェーズにまたがるが、これは規則の重複ではない。R-009 が定めるのは操作の **順序** であり、
その順序を 3 段階として明示したもの。commit としては不可分の書き込みシーケンスのため 1 つにまとめる。

> **注記**: `phase-design-note.md` v1.6.1 の Section 4「規則の網羅性検証」の表は R-001〜R-012 の
> 12 行しか持たず、DR-16 で追加された R-013 が漏れている(同ノートの本文と Change History はいずれも
> 「13 規則」と述べており、表側の記載漏れ)。本表がこれを補正する。

---

## 4. Open Items

impl フェーズで確定させる項目。振る舞い規則ではなく実装詳細のため、spec の Open Questions には追加しない。

| 項目                                              | 確定する Commit |
| ------------------------------------------------- | --------------- |
| 一時ファイルの衝突時動作                          | 8               |
| Windows での rename/move の原子性・同一ボリューム | 8 / 9           |
| R-013 の退避パス比較の正規化規則                  | 9               |
| 終了コードの具体値と機械可読出力のスキーマ        | 10              |
| 読み取り不可・権限エラー・走査中の消失の分類      | 7               |

決着済みで再検討しないもの:

- キャッシュのキー設計 — `ChatlogCache` 既存仕様どおり basename のみとする。内容ハッシュ等による
  identity 強化は行わない(REQ-C-001 の既存実装優先、REQ-C-008 の単一ディレクトリ限定が根拠)
- Markdown 見出し判定の厳密性 — REQ-C-004 が行頭完全一致・構文解析なしを規定済み
- 除去率閾値 — 固定値 99% のまま据え置き(実測最大 96.23%)
- AC-024 の判定基準 — `ChatlogFrontmatter` による同一性比較

---

## 5. Change History

<!-- SemVer: MAJOR = approach discarded, MINOR = decision criterion added,
     PATCH = clarification only. Keep frontmatter `version` equal to the newest row.
     `based-on` must cite a three-part version that exists in specifications.md.
     See deckrd-rule-document-versioning.md -->

| Date       | Version | Description                 |
| ---------- | ------- | --------------------------- |
| 2026-08-13 | 1.0.0   | Initial implementation plan |
