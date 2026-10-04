---
title: "Decision Records: libs/text"
module: "libs/text"
status: Draft
version: 1.0.0
created: "2026-10-05"
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

## Index

| ID    | Decision                                                         | 主な影響先                             |
| ----- | ---------------------------------------------------------------- | -------------------------------------- |
| DR-01 | `parseAiJsonArray` の `allowEmpty` を公開し、既定を false にする | `parseAiJsonArray` / 呼び出し 3 スキル |

---

## DR-01: `parseAiJsonArray` の `allowEmpty` を公開し、既定を false にする

**Status**: Accepted

**Context**: `parseAiJsonArray`（`skills/_cle-libs/libs/text/json-utils.ts`）は、AI 出力から JSON 配列を
3 段階のフォールバックで抽出します。

1. 段階 1 `_parseDirectArray` — 出力が `[` で始まる（またはコードフェンス内が `[` で始まる）場合に直接パースする
2. 段階 2 `_parseFirstBracketMatch` — non-greedy な括弧マッチで最初にパースできた配列を返す
3. 段階 3 `_parseGreedyBracketMatch` — greedy な括弧マッチで最長区間をパースする

変更前は、段階 1 だけが内部で `allowEmpty = true` を渡しており、`'[]'` を成功として返していました。
段階 2 / 3 は空配列を受理しません。これは散文中の `[]`（例: `結果は [] です`）を配列応答と誤認しないための制限です。
ただしこの理由は括弧マッチで本文から配列を拾い出す段階 2 / 3 にしか当てはまらず、
出力全体が配列である段階 1 には当てはまりません。つまり段階 1 だけが根拠なく非対称でした。
しかも `allowEmpty` は公開されていなかったため、呼び出し側は空配列を拒否できませんでした。

空配列はどの呼び出し元でも「入力 N 件に対して判定が 1 件も返らなかった」ことを意味します。
呼び出し 3 箇所で `[]` を受信したときの実挙動を調査しました（2026-09-30、main = `5122632d3` 時点）。

| 呼び出し元 | 箇所（調査時点）                                     | `[]` 受信時の挙動                                                                                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| filter     | `filter-chatlogs/.../process-chunk.ts:117-119`       | 直後の `length === 0` 検査で `EmptyArray` として error 計上し、`maxRetry` でリトライする。gh-483 で対処済み                                                                                                                                                          |
| classify   | `classify-chatlogs/.../phase-classify-ai.ts:154-170` | `if (!parsed)` を空配列が素通りする。`parsed.find()` が全件未ヒットになり、全件へ `project='misc'` / `confidence=0` / `action=MOVEBYAI` を `cache.write` する。ファイルは実際に `misc/` へ移動し、結果がキャッシュに残るため再実行しても復旧しない。最も実害が大きい |
| normalize  | `normalize-chatlogs/.../segment-ai.ts:155`           | `_parsed === null` を素通りし、結果 Map は全件 `null` のまま。`phase-segment.ts:88-95` が `status='retry'` を書くので次回実行で再判定され、自己回復する。ただしログは per-file の `no entry returned for` だけで、空配列と部分応答を区別できない                     |

**Decision**:

1. `ParseAiJsonArrayOptions.allowEmpty` を公開し、既定を **false** とする（fail-first。段階 2 / 3 と揃える）。
   既定では `'[]'` は `null` を返す
2. `allowEmpty` は段階 1 にのみ効き、段階 2 / 3 へは伝播しない。`{ allowEmpty: true }` を渡しても
   `'結果は [] です'` は `null` のままとする（散文中の `[]` 誤検出回避の境界を維持する）
3. 空配列を「パース失敗」と区別して扱いたい呼び出し元は、`allowEmpty: true` を **明示** し、
   自前で `length === 0` を検査する。既定 false の副作用（`null` 経路への合流）に寄りかからない。
   こうしておけば、`parseAiJsonArray` の既定が将来また変わっても呼び出し元の挙動は変わらない

3 呼び出し元はいずれも 3. の形で、空配列を専用の理由・ログで区別する。

| 呼び出し元 | 実装（決定後）                                    | 空配列時の扱い                                                                                                                                                    |
| ---------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| filter     | `process-chunk.ts:138-140`（`_validateResponse`） | `{ ok: false, reason: 'AI 応答が空配列', subindex: 'EmptyArray' }` を返し、error 計上 + リトライ                                                                  |
| classify   | `phase-classify-ai.ts:179-181`                    | `_failChunk(..., 'AI 応答が空配列')` でチャンク全件を error 扱いにする。`misc` への誤分類は起きない                                                               |
| normalize  | `segment-ai.ts:158-166`                           | `segmentChatlogs: empty array response — <paths>: <raw 先頭 200 文字>` をチャンク単位で 1 行 warn し、全件 `null` を返す（`status='retry'` の自己回復経路は維持） |

**Rationale**: 3 呼び出し元はいずれも入力ファイルごとの判定を配列で受け取ります。
1 件以上の入力に対する空配列は正常応答になりえません。
したがって既定で失敗扱いにするのが fail-first に沿います。段階 1 の非対称性も解消され、3 段階すべてが
「既定では空配列を受理しない」という同じ契約になります。

classify の実害（誤移動 + キャッシュへの焼き付き）は、既定を false にした時点で `null` 経路へ入るため
副作用としては止まります。ただし、それだけでは意図した設計としてテストで固定されません。
そのため classify も `allowEmpty: true` + `length === 0` を明示し、RED 先行のテストで固定しました。

**Alternatives Considered**:

- 既定 true のまま、各呼び出し元で `length === 0` を検査する — 3 呼び出し元の修正量は同じですが、
  段階 1 だけが空配列を受理する非対称性がライブラリに残ります。新しい呼び出し元が検査を書き忘れると、
  classify と同じ穴（判定ゼロを成功と誤認する）を再び踏みます
- `allowEmpty` を段階 2 / 3 にも伝播させる — 散文中の `[]` を配列応答と誤認する経路が開くため採らない

**Consequences**:

- `T-LIB-J-20-01` は新契約（既定で `parseAiJsonArray('[]')` → `null`）を固定するよう書き換えた
- 既定を変えたため、オプション無しで呼ぶ既存コードは空配列で `null` を受け取る。現時点の production 呼び出し元 3 箇所は
  いずれも `allowEmpty: true` を明示している
- 既定 false の前提で陳腐化した `libs/ai-backend` の仕様・タスク記述の追随は `cle-jkn.5` に残る

> 出典: beads `cle-jkn`（調査ノート 2026-09-30） / `cle-jkn.1`（e1e9a9ab4） / `cle-jkn.2`（5dc089eac） / `cle-jkn.3`（0d328e460） / filter 側 f133991a2 / GitHub #484。filter の発端は GitHub #483

---

## Change History

| Date       | Version | Description                                                                                  |
| ---------- | ------- | -------------------------------------------------------------------------------------------- |
| 2026-10-05 | 1.0.0   | 初版。gh-484 の空配列調査と `allowEmpty` 既定 false の決定を DR-01 として記録（`cle-jkn.4`） |

<!-- markdownlint-enable line-length -->
