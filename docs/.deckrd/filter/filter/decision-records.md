---
title: "Decision Records: filter/filter"
module: "filter/filter"
status: Draft
version: 1.0.0
created: "2026-09-08"
---

> This document records architectural and design decisions.
> It is non-normative and exists to preserve rationale.

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/max-comma,
  -->
<!-- markdownlint-disable line-length -->

<!--
IDs MUST be sequential: DR-01, DR-02, ...

Versioning (SemVer, see deckrd-rule-document-versioning.md):
  MINOR — a new DR is added
  PATCH — an existing DR's wording or rationale is clarified
  MAJOR — an accepted DR is superseded or reversed

Keep frontmatter `version` equal to the newest Change History row below.
-->

> 本書は KEEP / DISCARD 判定を行う `filter-chatlogs.ts` を対象とします。
> 定型部の除去は `filter/strip`、ノイズファイルの除外は `filter/noise-filter` が持ちます。

## Index

| ID    | Decision                                                                       | 主な影響先                              |
| ----- | ------------------------------------------------------------------------------ | --------------------------------------- |
| DR-01 | fixture テストは本体のプロンプトと同一経路を通し、パース失敗を assert で落とす | `fixtures.spec.ts` / `process-chunk.ts` |
| DR-02 | 実 AI を呼ぶテストは system tier に一本化し、fixtures tier を廃止する          | `keep-discard-criteria.system.spec.ts`  |

---

## DR-01: fixture テストは本体のプロンプトと同一経路を通し、パース失敗を assert で落とす

**Status**: Accepted

**Context**: `skills/filter-chatlogs/scripts/__tests__/fixtures/filter/fixtures.spec.ts` は
`process-chunk.ts` の `_SYSTEM_PROMPT` を **ローカルに再定義** しており、本体から乖離していました。
デリミタとインジェクション防御ブロックが欠落し、KEEP / DISCARD 基準も旧文言のままです。

この構造では、`process-chunk.ts` のプロンプトを変更してもテストに反映されません。
プロンプトの回帰を検知するはずのテストが、プロンプトの変更から独立して緑のままになります。

**Decision**:

1. ローカルの `_SYSTEM_PROMPT` を削除し、`process-chunk.ts` から import する
2. user prompt も `buildBatchPrompt` 経由（本体と同一経路）に統一する
3. パース失敗時のサイレント PASS を assert に置き換える

**Alternatives Considered**:

- ローカル定義を本体の現行文言に更新する — 同じ乖離が次のプロンプト変更で再発します。
  2 箇所に同じ文字列を置く限り、同期は人手の注意力に依存し続けます
- プロンプトの同一性だけを比較するテストを別に足す — 乖離は検知できますが、
  fixture テスト自体は依然として本体と違うプロンプトで判定を検証することになります。
  検証対象が本番経路でないという問題は残ります

**Consequences**: 既存 fixture `normal-01-basic-keep`（一般的な TypeScript の Result 型
チュートリアル Q&A）は、新しい KEEP 基準「WHY が残っているか」では DISCARD 側へ振れます。
プロジェクト固有の決定や却下理由を含まない教科書的な解説だからです。
import 化に伴い、この fixture を `normal-01-design-rationale-keep` へ差し替えました。

`deno task test:module fixtures filter --use-ai` が ignored ではなく実行されて
PASS することを確認しています。

> 出典: beads `cle-8s3`（closed 2026-08-20） / GitHub #443

---

## DR-02: 実 AI を呼ぶテストは system tier に一本化し、fixtures tier を廃止する

**Status**: Accepted

**Context**: DR-01 で `fixtures.spec.ts` を本体の `_SYSTEM_PROMPT` / `buildBatchPrompt` 経路へ
統一した結果、`fixtures/filter/fixtures.spec.ts` と
`system/filter/keep-discard-criteria.system.spec.ts` が **ほぼ同一の検証** をするようになりました。

同じ `_SYSTEM_PROMPT`、同じ経路（`buildBatchPrompt` → `runAI` → `parseAiJsonArray`）、
同じ fixture ディレクトリ構造、同じ `output.yaml` スキーマです。
差分は fixture の題材と `describe` ラベルだけになりました。
**実 AI 呼び出しを 2 系統維持するコストに見合いません。**

**Decision**:

1. `fixtures.spec.ts` を廃止し、fixture 4 件を `keep-discard-criteria.system.spec.ts` へ集約する
2. 移設分は `T-FL-KDC-03` / `T-FL-KDC-04` に採番し直し、`T-FL-FC` prefix を廃止する
3. fixture は 4 件すべて残す

**Rationale**: 両者の違いは fixture の題材、すなわちデータだけです。
データ差分は fixture 駆動テストが本来吸収すべきものであり、
スイートを分ける理由になりません。

加えて、filter の `fixtures.spec.ts` は fixtures tier で **唯一実 AI を呼ぶテスト** でした。
他の実 AI テストはすべて system tier にあります。統合により
「実 AI を呼ぶテストは system tier」という区分が揃います。

決定 3 の理由は、fixture の題材自体は重複ではなく補完的だからです。

- `normal-01` / `normal-02`（KDC-01 / 02）— 技術用語の濃さと理由の有無を逆転させた対照ペア。
  判定軸が「技術的か」ではなく「WHY があるか」であることを証明する
- `normal-03` / `normal-04`（KDC-03 / 04、旧 FC-01 / 02）— 交絡のない素直なペア。基本動作の回帰検知

**Alternatives Considered**:

- 両スイートを残し、役割の違いを describe ラベルとコメントで明示する —
  実 AI 呼び出しが 2 系統残ります。呼び出し回数は実行時間と API 消費に直結し、
  ラベルでは減りません
- `fixtures.spec.ts` を残して system 側を廃止する — fixtures tier に実 AI テストが
  1 件だけ残る構図が続きます。他の実 AI テストが system tier にある以上、
  tier の意味が filter だけ例外になります

**Consequences**: fixtures tier から実 AI 呼び出しが消え、
「実 AI = system tier」の区分が全スキルで揃いました。`T-FL-FC` prefix は廃止済みのため、
今後この prefix を再利用してはいけません。

> 出典: beads `cle-er9`（closed 2026-09-07） / GitHub #443

---

## Change History

| Date       | Version | Description                                                                                             |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 / DR-02 を記録（`cle-8s3` / `cle-er9` が出典） |

<!-- markdownlint-enable line-length -->
