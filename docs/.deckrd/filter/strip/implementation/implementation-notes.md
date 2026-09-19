---
title: "Working Note: filter strip の実装時の落とし穴"
module: "filter/strip"
status: Working Note
created: "2026-09-19"
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- markdownlint-disable line-length -->

> **本書の位置づけ**
>
> 本書は `/deckrd impl` による正式な implementation 文書ではありません。
> 実装・テスト時に踏んだ落とし穴と、その根拠 (DR / 仕様の該当箇所) を保全する作業ノートです。
> 振る舞い規則を新たに定めるものではなく、決定の在処は `decision-records.md` と
> `specifications/specifications.md` が正です。
>
> 出自: 2026-09-19 の永続メモリー棚卸しで、`bd remember` から本モジュール固有の知見を移送したもの。

## 1. `backupOldPath` に RenameProvider を後付けしない

`backupOldPath` (`_cle-libs/libs/file-ops/backup-old-path.ts`) は `Deno.rename` を直接呼び、
注入口は `GlobProvider` のみである。そのため戻り値や連番 (`.old-NN`) の挙動を検証するテストは
unit に置けない — fake glob で「ファイルが存在する」と偽ると `/fake/` に対して実リネームが走る。

T-LIB-B-08 / 09 / 10 は `Deno.makeTempDir` を使う system に配置した。
unit に残せるのは `BackupProvider` への代入可能性 (T-LIB-B-07) のような型レベル検証のみ。

**DR-18 決定 1 / 5 が Commit 4 の射程を「戻り値の拡幅のみ」に限定しているため、
unit 化のために RenameProvider を後付けしてはならない。**

## 2. DR-03 決定 3 は Provider でのリネームスキップを禁じていない

「冪等判定は Provider ではなく呼び出し側に置く」(DR-03 決定 3) は、
**Provider が既存 `.bak` に対し `null` を返すこと自体は禁じていない** (決定 2 で採用済み)。
DR-03 の Rationale が Option B を「退避済みなら書き込みごとスキップする」判定に限定し、
両者は別の話であると明記している。

決定 3 の文言だけを読むと矛盾に見えるので、**Provider 契約を触るときは DR-03 の Rationale まで読む。**
DR-17 はこの区別に依拠して `backupToBak` のスキップ + `null` を採用した。

## 3. `StripDecision` は行番号とバイト数で基準が異なる

| フィールド                            | 基準                              | 根拠                                                     |
| ------------------------------------- | --------------------------------- | -------------------------------------------------------- |
| `removalStartLine` / `removalEndLine` | ファイル全体 (frontmatter を含む) | `implementation/phase-design-note.md` の報告行番号の規定 |
| `removedBytes` / R-007 除去率の分母   | 本文のみ (frontmatter を除外)     | `specifications/specifications.md`                       |

除去範囲は常に本文先頭からで固定のため、行番号を本文基準にすると `removalStartLine` が常に 0 になり
返す意味が消える。frontmatter の行数だけ本文がずれるからこそ明示的に返す。

`findBoundaryLine` は body 内インデックスを返すので、
`removalEndLine = frontmatter 行数 + boundaryIdx - 1` に変換が必要。
`boundaryIdx - 1` をそのまま返すと本文基準になり誤り。**この 2 基準は `tasks.md` からは読み取れない。**

## 4. `removedBytes` は最終行の終端子を含まない

`classifyStrip` が返す `removedBytes` は除去範囲の行を `'\n'` で join した長さであり、
最後の除去行の行末終端子を含まない (範囲の全文が終端子込みで 56 バイトなら 55 を返す)。
一方 `removalStartLine` / `removalEndLine` は inclusive な行番号である。

書き込み側で `[removalStartLine, removalEndLine]` を inclusive に splice すると、
報告した `removedBytes` より 1 バイト多く除去することになる。差分を暗黙に引き継がない。

## 5. R-002 は `hasFrontmatter()` を使う

R-002 (frontmatter 欠落判定) で `divideEntry()` を直接呼んではならない。
`divideEntry` は閉じ `---` が無い場合に `ChatlogError('InvalidFormat', 'NotClosed')`、
YAML 構文エラーで `ChatlogError('InvalidYaml', 'YamlSyntaxError')` を throw する (実測確認済み)。

どちらも `isFileIoError` が false のため DR-21 決定 3 により再 throw され実行全体が中断する。
1 件の壊れたファイルが全件の処理を止めるのは DD-03 (安全弁は個別ファイル単位で作用し
実行全体を中断しない) 違反である。

`hasFrontmatter` は両ケースとも false を返すので、壊れた frontmatter を「持たない」と同一視して
error 計上・継続にできる。`divideEntry` を呼ぶのは **R-002 通過後** に限る。

## 6. R-009 の書き込みは `writeTextFile` の再利用で足りる

R-009 (tmp → 退避 → スワップ) は新規ユーティリティを書かず
`writeTextFile(path, text, (p) => backupToBak(p))` を呼ぶだけで実現できる。
`_cle-libs/libs/file-io/write-utils.ts` が既に tmp 書き出し → backup() → `Deno.rename` の順で
R-009 をそのまま実装しているため。

ただし backup が `null` を返しても rename を無条件に実行するので (これは DR-03 の決定。
`.claude/rules/coding-guidelines.md` の「触ってはいけない既知の設計」参照)、
**戻り値 `null` の検査では「本体を書き換えない」保証は得られない。**
退避既存時に原文を守るには、`writeTextFile` 呼び出し前に `fileExists(path + '.bak')` で
事前チェックして return する必要がある。throw する backup provider を渡す代替案は `.tmp` が残るため、
R-014 の孤立退避走査に抵触する。

## 7. 単一ライター前提

`chatlogs/` 配下へ書き込むのは本ツール群のみであり、外部プロセス (エディタ・Obsidian・
他スキルの同時実行) との競合は想定しない。**DR-36 で明文化済みで、
`requirements/requirements.md` Section 2 Assumptions に記載がある。**
同種の競合指摘 (TOCTOU・ファイルロック・退避後の内容照合) が再度来たら DR-36 を参照する。
