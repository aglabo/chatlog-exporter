---
title: "Decision Records: filter/filter"
module: "filter/filter"
status: Draft
version: 1.6.1
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

| ID    | Decision                                                                       | 主な影響先                                  |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| DR-01 | fixture テストは本体のプロンプトと同一経路を通し、パース失敗を assert で落とす | `fixtures.spec.ts` / `process-chunk.ts`     |
| DR-02 | 実 AI を呼ぶテストは system tier に一本化し、fixtures tier を廃止する          | `keep-discard-criteria.system.spec.ts`      |
| DR-03 | KEEP / DISCARD の判定軸は技術性ではなく「WHY が残っているか」                  | `process-chunk.ts` の `_SYSTEM_PROMPT`      |
| DR-04 | prefilter の「会話本文が空」判定は削除する（User ターン検査が覆う）            | `prefilter.ts` の `_classifyEntryByContent` |
| DR-05 | AI の空配列応答は共有パーサではなく filter 側でチャンク失敗として扱う          | `process-chunk.ts` の `_failChunk`          |
| DR-06 | 応答の形が壊れているときだけチャンクを再要求する                               | `process-chunk.ts` の `_validateResponse`   |
| DR-07 | 位置引数は 6 個までとし、超えたらオブジェクト引数に畳む                        | `process-chunk.ts` / `filter.types.ts`      |
| DR-08 | llama 経路の応答契約違反は実行失敗ではなく再要求対象とする                     | `abort-utils.ts` / `process-chunk.ts`       |

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

## DR-03: KEEP / DISCARD の判定軸は技術性ではなく「WHY が残っているか」

**Status**: Accepted

**Context**: 旧判定軸は「会話が技術的か」でした。この軸は両方向に外していました。

1. 技術用語が濃いだけの実行ログを拾いすぎる
2. 技術的に薄いが、却下理由・制約・ハマりどころ・ユーザーの確定回答が残るログを取りこぼす

**Decision**: `process-chunk.ts` の `_SYSTEM_PROMPT` の判定軸を
**「判断の理由 (WHY) が残っているか」** に置き換える (2026-08-21)。
KEEP は the log records WHY、DISCARD は the log records only WHAT happened。

新軸の文言は、ユーザーのグローバル `CLAUDE.md` の長期メモリー規約
(設計判断とその理由 / 制約・前提 / ハマりどころと解法 / ユーザーの確定回答) から移植したものです。

**Rationale**: 技術性はプロンプトで明示しなくても、判定する claude 自身が担保します。
併記すると旧軸の失敗 (1) を再び招くため書かない — これはユーザーの判断です。

実測 (各 5 回) では、旧基準の 2 fixture 同時 PASS が約 8% だったのに対し、
新基準は 5 / 5・confidence 0.85-0.96 でした。

**Consequences**: 検証は system テスト
`skills/filter-chatlogs/scripts/__tests__/system/filter/keep-discard-criteria.system.spec.ts`
(`RUN_AI=1` ゲート、T-FL-KDC-01 / 02) が担います。
DR-01 / DR-02 が前提としている「新しい KEEP 基準」とは本 DR を指します。

> 出典: 2026-09-19 の永続メモリー棚卸しで `bd remember` から移送（決定自体は 2026-08-21）

---

## DR-04: prefilter の「会話本文が空」判定は削除する（User ターン検査が覆う）

**Status**: Accepted

> 本 DR が対象とする `prefilter.ts` は `filter-chatlogs.ts` と `noise-filter-chatlogs.ts` の
> 両エントリで共有されます。本書冒頭のスコープ注記が挙げる `filter/noise-filter` は
> ディレクトリが存在しないため、共有部分の決定は本書に置きます。

**Context**: `_classifyEntryByContent` は `extractConversation(content, maxBodyChars)` の結果が
空かどうかで `'会話本文が空'` として除外する分岐を持っていました。この分岐に渡る `maxBodyChars` は、
どんな値を入れても振る舞いを変えない死んだ引数でした。さらに調べると、**分岐そのものが
すべての入力に対して到達不能** でした。

`_classifyEntryByContent` は同じ `content` を 2 回評価します。

1. `isExcludedByContent(content, ...)` が `!hasUserTurn(parseConversation(content))` のとき
   `'Userターンが存在しない'` として除外する
2. それを通過した場合にのみ `extractConversation` の空判定へ進む

会話ターンが 0 件なら User ターンも 0 件なので (1) で必ず除外されます。したがって (2) に到達した
時点で User ターンが 1 件以上あり、`renderConversation` は各ターンを `'### User\n…'` /
`'### Assistant\n…'` として join した文字列を返すため、`maxBodyChars >= 1` のいかなる値でも
先頭が `'#'` になり `.trim()` は空になりません。`maxBodyChars` はスキーマで `min: 1` に
固定されているので `0` を渡す経路もありません。

実測: 分岐をまるごと削除すると `deno task test` の 445 件のうち落ちるのは `T-FL-PFF-22-01`
（`maxBodyChars: 0` を直接渡してこの配線を pin するテスト）の 1 件だけでした。`0` はスキーマが
禁じる値なので、このテストは production から到達できない入力を pin していました。

**Decision**: `prefilterFiles` / `_phase3PartitionByContent` / `_classifyEntryByContent` から
`maxBodyChars` 引数を落とし、`'会話本文が空'` 分岐を削除する。`PrefilterFilesOptions` と
`NoiseFilterConfig` からも同名フィールドを落とす（noise-filter は AI を呼ばないため用途が皆無）。
**代替ガードは足さない。**

**Alternatives Considered**:

- 引数だけ落として `parseConversation(content).length === 0` のガードを残す — 却下。
  同じ理由で到達不能のままなので、テストで覆えない分岐が残るだけです。防御的に見えて、
  実際には「この分岐の動いた例が 1 つも存在しない」状態を固定します
- 切り詰め後の本文長が閾値未満なら除外する形にして `maxBodyChars` を生かす — 却下。
  `minCharCount` が既に本文長のゲートを持っており、`maxBodyChars` は `SKILL.md` と
  `config.yaml` で「バッチプロンプトへ埋め込む本文の切り詰め長」と文書化されています。
  同一のキーに除外閾値の意味を重ねると、設定の意味が二重化します

**Consequences**: `maxBodyChars` の意味はバッチプロンプトの切り詰め長だけになり、
`SKILL.md` の記述と実体が一致します。`T-FL-PFF-22` / `T-FL-PFF-23` は廃番とし、この連番を
再利用してはいけません。削除後の保証は次の 2 件が担います。

- `T-FL-IC-02-03` — 会話見出しを含まない `minCharCount` 以上の本文が
  `'Userターンが存在しない'` で除外される（unit）
- `T-FL-PFF-24-01` — 同じ入力が `prefilterFiles` を通過しない（functional）

レビュー（人間・AI とも）が「会話本文の空判定が無い」と指摘してきたら、本 DR で閉じてください。

> 出典: beads `cle-kju.3.2.1`（GitHub #478）

---

## DR-05: AI の空配列応答は共有パーサではなく filter 側でチャンク失敗として扱う

**Status**: Accepted

**Context**: 本 DR の起票時点では、`parseAiJsonArray` は段 1（`_parseDirectArray`）で空配列を無条件に受理し、
構文的に有効な `[]` を成功として返していました（ai-backend DR-06 / DR-28）。
現在は gh-484（libs/text DR-01）で `allowEmpty` の既定が false になり、filter は `process-chunk.ts` で
`{ allowEmpty: true }` を明示して同じ `[]` を受け取ります。llama / avalon はリテラル `[]` を
返すことがあり、このとき `process-chunk.ts` の `if (!parsed)` を素通りし（`[]` は truthy）、
続く `parsed.find()` が全件未ヒットになってチャンク全員が「判定不能 skip」へ落ちていました。
生の応答はログに残らず `stats.error` も 0 のままで、サマリーは正常終了に見えます。
次回実行でも同じ応答が返るため、判定が収束しません。

ai-backend DR-06 の Consequences は空配列受理について
「既存 4 スキルの空配列時の処理が意図どおりかの確認を要します」と記しており、
本 DR はその filter 側の回答にあたります。

**Decision**:

1. `parsed.length === 0` を JSON パース失敗と同じ扱いにする
   （raw output ログ + チャンク件数を `stats.error` へ加算 + `ChatlogError` 返却）
2. 返す `ChatlogError` の subindex は `JsonParse` と分けて `EmptyArray` とする。`kind` は
   `InvalidFormat`（非 `AiError`）を維持し、続行側であることを
   `isAbortingAiError` / `describeAbortReason` へ伝える
3. 共通ライブラリ `parseAiJsonArray` は本 DR では変更しない。その後 gh-484（libs/text DR-01）で `allowEmpty` が公開され
   既定が false になったため、filter は `{ allowEmpty: true }` を明示して空配列を受け取り、決定 1 / 2 の
   `EmptyArray` 識別を保つ。空応答での再要求は本 DR の範囲外（`cle-74a.3`）
4. 2 分岐で共通する「見出しログ / raw output ログ / 全件 error 扱いログ / `stats.error` 加算」は
   内部ヘルパー `_failChunk` に寄せ、`slice(0, 200)` のリテラルを 1 箇所に保つ

**Alternatives Considered**:

- 共有パーサ側で空配列を `null` に戻す — 却下。classify-chatlogs / normalize-chatlogs / set-frontmatter
  にも同時に波及し、それぞれで「空配列が正常応答になりうるか」が未調査です（gh-484 の範囲）。
  filter の不具合を直すために他スキルの挙動を巻き添えで変える理由がありません
- 既存の `!parsed` 分岐へ畳み込む（`!parsed || parsed.length === 0`） — 却下。パースに成功した
  応答に対して「JSON パース失敗」とログが出ます。原因を追う人は `raw output: []` と矛盾した見出しを
  読むことになります。さらに `cle-74a.3` が「空応答」と「壊れた応答」を区別できず、`rawResult` を
  再パースして判別する羽目になります
- 空配列を「該当なしの正常応答」として skip のまま扱う — 却下。`_SYSTEM_PROMPT` は
  「Emit exactly one array element per block」を要求しており、空配列は契約違反です。
  skip のままでは次回実行でも同じ応答が返り、#483 のとおり収束しません

**Consequences**: これまで skip に計上されていた空配列応答が error に移るため、llama 経路のサマリーで
`error` が立つようになります（これが本 DR の目的であり退行ではありません）。
`buildAbortSkipMessage` は `kind === 'AiError'` の subindex のみをラベル化するため、`EmptyArray` は
中断理由として採用されず、未実行チャンクの警告文言は変わりません。
gh-484 が空配列の扱いを変えた後も、filter は自前の `parsed.length === 0` 判定を保持して
`EmptyArray` の識別を維持します。検証は `T-FL-PCK-16-01` 〜 `-05`（functional）が担います。

> 出典: beads `cle-74a.2`（GitHub #483） / 前提は ai-backend DR-06・DR-28

---

## DR-06: 応答の形が壊れているときだけチャンクを再要求する

**Status**: Accepted

**Context**: DR-05 で空配列応答を error 化したところ、今度は取りこぼしが問題になりました。
同一プロンプトでも llama の応答は揺らぎ、#483 の実測では 3 回中 1〜2 回だけ成功するファイルが
あります。1 回の不正応答で error を確定させると、本来判定できるファイルまで落とします。

要素数不一致も同じ性質です。`_SYSTEM_PROMPT` は
「Emit exactly one array element per block」を要求していますが、llama は一部のブロックを
黙って落とすことがあります。従来この形は `parsed.find()` の未ヒットとして
ファイル単位の「判定不能 skip」になり、契約違反であることが記録に残りませんでした。

`maxRetry` は `config-schema.constants.ts` にスキーマ定義済み（既定 2、上限 10）でしたが、
実際に使っているのは set-frontmatter の 2 経路だけでした。

**Decision**:

1. `processChunk` に `maxRetry`（第 9 引数、既定 0）を追加し、最大 `maxRetry + 1` 回まで
   同じチャンクを再要求する。ループ形は `setfm-frontmatter.ts` / `setfm-review.ts` と同型
   （`for (let attempt = 0; attempt <= Math.min(maxRetry, 10); attempt++)`）
2. **再要求の対象は「AI 実行は成功したが応答の形が壊れている」3 ケースだけ** とする。
   判定は `_validateResponse` が一手に引き受け、失敗理由と subindex を返す
   - パース失敗 → `JsonParse`
   - 空配列 → `EmptyArray`（DR-05）
   - 要素数がチャンク件数と不一致 → `CountMismatch`（新規）
3. **AI 実行そのものの失敗（`ChatlogError` の throw）は再要求しない。** 従来どおり即
   `stats.error` 加算 + 返却とし、中断側エラーでは `ctl.abort()` を先に効かせる
   （**DR-08 で対象を限定**。throw で届く失敗のうち応答契約違反は再要求対象に移した）
4. 使い切ったら `_failChunk` を **1 回だけ** 呼ぶ。`stats.error` の加算はチャンク件数ちょうどで、
   試行回数分の多重加算はしない
5. 要素数不一致で使い切った場合も **チャンク全件を error** にし、部分一致分を cache に書かない
6. ファイル名不一致だが **要素数は一致** しているケースは従来どおり
   （該当ファイルのみ「判定不能 skip」。チャンク全体の失敗にしない）
7. 制御は `config.yaml` の `maxRetry` のみ。CLI フラグは作らない

**Alternatives Considered**:

- AI 実行失敗も再要求する — 却下。レートリミットや接続失敗は同じ要求を繰り返しても
  結果が変わらず、待機を持たない再試行はバックエンドへの負荷を増やすだけです。
  中断側エラー（`isAbortingAiError`）はむしろ即座に `ctl.abort()` して
  残りのチャンクを止めるのが正しく、再要求はその判断を遅らせます
- 要素数不一致で、一致した分だけ判定を採用して残りを skip にする — 却下。
  取りこぼしを減らすように見えますが、応答が部分的に壊れている状態で
  「届いた分は正しい」と仮定する根拠がありません。チャンク単位で捨てて次回再判定するほうが、
  誤った DISCARD を確定させるリスクを負いません。skip と違って error なら
  サマリーにも残り、`maxRetry` を上げる判断材料になります
- `_validateResponse` を作らず `processChunk` 内にインラインで 3 分岐書く — 却下。
  ループ本体が肥大し、「どの失敗で subindex が何になるか」がループ制御と混ざります。
  検証だけを純関数に切り出せば、リトライ判断は `ok` を見るだけで済みます
- strip の DR-27 に倣って filter 専用のリトライ定数を別に定義する — 却下。
  DR-27 が `GlobalConfig.maxRetry` の転用を退けたのは、対象が **ファイル I/O の再試行** で
  「`runAI` 用かつ待機を持たない」性質が合わなかったためです。本件は
  まさに `runAI` の呼び出し回数であり、`maxRetry` の本来の用途に一致します。
  DR-27 を根拠に本 DR へ反対できません

**Consequences**: llama 経路で判定の確定する率が上がる一方、不正応答の続くチャンクでは
AI 呼び出しが最大 `maxRetry + 1` 倍になります。既定は 2（= 最大 3 回）で、
`config.yaml` の `maxRetry: 0` で従来どおりの単発動作に戻せます。
`processChunk` の引数は 9 個になりました（`aiRunnerProvider` は第 10）。
`generateFrontmatter` も同数であり、このリポジトリでは許容範囲としています。
要素数不一致がこれまで `skip` に載っていた分は `error` に移ります。
検証は `T-FL-PCK-17-01` 〜 `-08`（functional）と `T-FL-BC-45-01` / `-02`（設定解決）が担います。

> 出典: beads `cle-74a.3`（GitHub #483） / 前提は DR-05

---

## DR-07: 位置引数は 6 個までとし、超えたらオブジェクト引数に畳む

**Status**: Accepted

**Context**: DR-06 の Consequences は「`processChunk` の引数は 9 個になったが、
`generateFrontmatter` も同数でありこのリポジトリでは許容範囲」と記録しました。
判断の根拠が「他にも同じくらい多い関数がある」だけで、上限の数字がどこにもありません。
基準が無いままだと、引数は 1 つずつ足され、そのたびに同じ理由で据え置かれます。

実際に `processChunk` の呼び出しを書くと、次の 2 点が負担になります。

末尾 3 引数が `model?: string` / `maxRetry: number` / `aiRunnerProvider` の順に並ぶため、
`maxRetry` や差し替え用 runner だけを渡す呼び出しでも、`model` の位置に `undefined` を
書かなければなりません。`process-chunk.functional.spec.ts` には
`..., maxBodyChars, undefined, 2, runner)` という形が並んでいました。

さらに `discardThreshold` と `maxBodyChars` はどちらも `number` で、間に `cache` / `ctl` を
挟んだ第 3 引数と第 6 引数に離れて置かれています。取り違えても型検査を通り、
DISCARD 閾値に 8000 を渡しても実行時まで気づけません。

同じスキルの `prefilterFiles(entries, stats, options)` は、蓄積用の `stats` までを位置引数、
残りを options オブジェクトに寄せる形をすでに取っています。畳む形の前例はあり、
足りないのは「いつ畳むか」の線引きだけです。

**Decision**:

1. **位置引数は 6 個を上限とする。4〜6 個が許容範囲、7 個以上になる関数は
   オブジェクト引数に畳む。** 引数を足して 7 個目になる時点が畳むタイミングであり、
   「他にも多い関数がある」は据え置きの根拠にしない
2. 畳む範囲は末尾の設定値・依存（省略可能な値、注入する provider、閾値）とする。
   処理対象そのものと、呼び出し側が持ち回る蓄積先は位置引数に残す。
   結果として `prefilterFiles(entries, stats, options)` と同型になる
3. `processChunk` に適用し、`processChunk(chunkEntries, stats, options)` の 3 引数にする。
   `options` の型は `filter.types.ts` の `ProcessChunkOptions` とし、`FilterProcessOptions` /
   `PrefilterFilesOptions` と同じ節に置く
4. 既定値はシグネチャではなく分割代入で与える（`maxRetry = 0` / `aiRunnerProvider = runAI`）。
   `model` は省略時にキーごと存在しない形とし、`undefined` を明示させない
5. **外部仕様は変えない。** 判定ロジック・リトライ挙動・`stats` の加算・戻り値・ログ文言は
   いずれも DR-05 / DR-06 のまま。テストのアサーションと ID も変更しない
6. 本 DR は DR-06 の Consequences にある「引数 9 個は許容範囲」という記述を置き換える。
   DR-06 の Decision（再要求の対象と回数）は有効なまま

**Alternatives Considered**:

- 上限を決めず、読みにくくなったら個別に判断する — 却下。DR-06 がまさにその判断をして
  9 個を据え置きました。基準が数字でないと、比較対象に同じくらい多い関数を挙げるだけで
  現状維持が正当化されます
- 上限を 3 個にする — 却下。`prefilterFiles(entries, stats, options)` や
  `processChunk(chunkEntries, stats, options)` は 3 個ですが、これは畳んだ後の姿です。
  畳む前から 3 個を強制すると、`buildBatchPrompt(entries, maxBodyChars)` のように
  素直な 2〜4 引数の関数まで options 型の定義を要求することになります
- 全引数を 1 つのオブジェクトに畳む — 却下。`prefilterFiles(entries, stats, options)` と
  形が揃わなくなります。`chunkEntries` は処理対象そのもの、`stats` は呼び出し側が持ち回る
  蓄積先であり、どちらも省略可能な設定値ではありません
- `ctx`（`stats` / `cache` / `ctl`）と `options`（設定値）の 2 バッグに分ける — 却下。
  意図の分離は明快になりますが、呼び出しが 3 段のオブジェクトリテラルになり、
  スキル内に前例のない形が 1 つ増えます。取り違えの防止という目的は 1 バッグで足ります
- `ctl: AbortController` を `signal: AbortSignal` に変える — 却下。`processChunk` は
  中断側 AI エラーで `ctl.abort()` を呼ぶ側であり、`signal` だけでは実装できません

**Consequences**: `processChunk` の呼び出し側がすべて名前付きになり、`discardThreshold` と
`maxBodyChars` の取り違えは型検査で落ちます。`model` のみ指定する呼び出しや
`aiRunnerProvider` だけを差し替える呼び出しから `undefined` が消えます。
移行対象は本番 1 箇所（`filter-chatlogs.ts`）と functional spec の 49 箇所でした。
外部仕様を変えないため、既存の `T-FL-PCK-01` 〜 `-17` が全件パスすることが移行の検証になります。

上限を数字で決めたことで、既存の未適用箇所が特定できるようになりました。
2026-09-30 時点で 7 個以上の位置引数を持つのは次の 7 関数です（`__tests__` を除く）。

| 引数 | 関数                   | ファイル                                                 |
| ---- | ---------------------- | -------------------------------------------------------- |
| 8    | `generateFrontmatter`  | `set-frontmatter/scripts/modules/setfm-frontmatter.ts`   |
| 7    | `phaseTypeAndCategory` | `set-frontmatter/scripts/phases/phase-type-category.ts`  |
| 7    | `phaseFrontmatter`     | `set-frontmatter/scripts/phases/phase-frontmatter.ts`    |
| 7    | `judgeTypeAndCategory` | `set-frontmatter/scripts/modules/setfm-type-category.ts` |
| 7    | `reviewFrontmatter`    | `set-frontmatter/scripts/modules/setfm-review.ts`        |
| 7    | `phaseWrite`           | `normalize-chatlogs/scripts/phases/phase-write.ts`       |
| 7    | `_processFiles`        | `filter-chatlogs/scripts/strip-chatlogs.ts`              |

いずれも本 DR の対象外で、着手するかどうかは別途判断します。`classify-chatlogs` の `processChunk`
（引数 5 個）と `prefilterFiles`（3 個）は許容範囲内であり、変更しません。

> 出典: beads `cle-74a.5`（GitHub #483） / 前提は DR-06

---

## DR-08: llama 経路の応答契約違反は実行失敗ではなく再要求対象とする

**Status**: Accepted

**Context**: DR-06 決定 3 は「AI 実行そのものの失敗（`ChatlogError` の throw）は再要求しない」と
定めました。この書き方は「throw で届く失敗 = 実行失敗」という前提に立っています。
llama 経路ではその前提が成り立ちません。`run-ai.ts` の `_runViaHttp` は応答を受け取ったあとに
自分で `parseContractPayload` / `validateOutputContract` を呼び、不適合を
`ChatlogError('AiError', 'ResponseSchemaViolation', ...)` として throw します
（DR-18 決定 1 が llama 経路の `kind` を一律 `AiError` に固定しているため）。

結果、`processChunk` の `catch` は種別を問わず即 `return` し、DR-06 が再要求対象と定めた
「応答の形が壊れている」失敗のうち **JSON パース失敗と契約違反が `_validateResponse` に
到達しないまま 1 回で error 確定** していました。`isAbortingAiError` の中断側一覧に
`ResponseSchemaViolation` は含まれないため `ctl.abort()` も呼ばれず、
「中断しないが再要求もしない」状態でした。

空配列と要素数不一致は契約検証を通過して `_validateResponse` に届くため、再要求されていました。
CLI 経路（claude / codex）は stdout をそのまま返すため 3 ケースすべてが届きます。
したがって欠落は **llama 経路 × パース失敗 / 契約違反** に限られます。

**Decision**:

1. DR-06 決定 3 の対象を **実行失敗・中断側エラー** に限定する
   （接続失敗・レートリミット・終了コード非 0・`ResponseFormatRejected` 等）。再要求の要否を分ける境界は throw の有無ではなく
   **subindex** とする
2. 続行側 subindex `ResponseSchemaViolation` を `abort-utils.ts` が単独所有する
   （`RESPONSE_FORMAT_VIOLATION_SUBINDEX`）。判定述語 `isResponseFormatViolation` も同ファイルに置き、
   呼び出し元に文字列リテラルを直書きさせない。`_ABORT_SUBINDEXES` には **入れない**
   （中断側の扱いと `isAbortingAiError` の振る舞いは変えない）
3. `processChunk` の `catch` を 3 分岐にする。非 `ChatlogError` → `throw` /
   応答契約違反 → `_lastFailure` へ記録して次の attempt へ / それ以外の `ChatlogError` → 従来どおり即 `return`
4. 応答契約違反の分岐では `stats.error` を **加算しない**。加算は使い切り時の `_failChunk` 1 回だけとし、
   DR-06 決定 4 の「チャンク件数ちょうど」を throw 経路にも適用する
5. throw 経路では生応答が手元に残らないため、`_failChunk` に渡す raw output には **例外メッセージ** を載せる。
   `_lastFailure` を `{ reason, subindex, rawResult }` に拡張し、`_validateResponse` 経由と throw 経由を
   同じ形で扱う

**Alternatives Considered**:

- `ResponseSchemaViolation` を `_ABORT_SUBINDEXES` に加える — 却下。中断側に入れると
  `ctl.abort()` が走り、残りのチャンクまで止まります。応答の揺らぎは同じ要求を送り直せば
  直り得る失敗であり、取りこぼしを減らすという DR-06 の趣旨に正面から反します
- `_runViaHttp` の契約検証をやめ、生応答を `_validateResponse` に委ねる — 却下。
  on-wire contract validation は llama 経路の transport 要件（R-007 / R-008）であり、
  filter 以外の呼び出し元も依存します。filter の都合で共通経路の検証を外すのは筋が逆です
- `catch` で `stats.error` を加算したまま `_failChunk` 側の加算を止める — 却下。
  `_validateResponse` 経由の既存経路が `_failChunk` の加算に依存しており、
  DR-06 決定 4 の「1 回だけ」が壊れます。加算点を 1 つに保つほうが不変条件を守れます
- filter 側で `e.subindex === 'ResponseSchemaViolation'` を直接見る — 却下。
  中断側と続行側の線引きが実装ファイルへ散り、片方だけ変わっても型検査に掛かりません
  （DR-16 決定 1 が中断側一覧を `abort-utils.ts` へ寄せたのと同じ理由）

**Consequences**: llama 経路でパース失敗・契約違反の発生時も、判定の確定する率が上がります。
AI 呼び出し回数の上限は DR-06 と同じ（最大 `maxRetry + 1` 倍）で、新たな増加はありません。
`abort-utils.ts` は中断側と続行側の両方の subindex を単独所有する形になりました。
検証は `T-FL-PCK-18-01` 〜 `-06`（functional）と `T-LIB-AI-LAP-09` / `-10`（unit）が担います。

> 出典: beads `cle-dny7`（GitHub #483） / PR #493 `discussion_r4139537356` / 前提は DR-06

---

## Change History

| Date       | Version | Description                                                                                                                            |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 / DR-02 を記録（`cle-8s3` / `cle-er9` が出典）                                |
| 2026-09-19 | 1.1.0   | DR-03 を追加。永続メモリー `filter-keep-discard-criterion` から移送                                                                    |
| 2026-09-29 | 1.2.0   | DR-04 を追加。prefilter の到達不能な「会話本文が空」判定と死んだ `maxBodyChars` 引数の削除を記録                                       |
| 2026-09-30 | 1.3.0   | DR-05 を追加。AI の空配列応答を filter 側でチャンク失敗として扱う決定を記録                                                            |
| 2026-09-30 | 1.4.0   | DR-06 を追加。応答の形が壊れているときだけチャンクを再要求する決定を記録                                                               |
| 2026-09-30 | 1.5.0   | DR-07 を追加。位置引数の上限を 6 個と定め、`processChunk` をオブジェクト引数へ畳む決定を記録                                           |
| 2026-09-30 | 1.6.0   | DR-08 を追加。llama 経路の応答契約違反を実行失敗から切り離し再要求対象とする決定を記録                                                 |
| 2026-10-05 | 1.6.1   | DR-05 の Context と決定 3 を gh-484（libs/text DR-01）後の現状へ追随。filter が `{ allowEmpty: true }` を明示する形を記録（cle-jkn.5） |

<!-- markdownlint-enable line-length -->
