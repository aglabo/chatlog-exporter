---
title: "Review: libs/ai-backend specifications (split, 5 files)"
phase: harden
persona: Normative Requirements Reviewer
document: "docs/.deckrd/libs/ai-backend/specifications/"
date: "2026-09-02"
status: draft
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-mix-dearu-desumasu,
  ja-technical-writing/no-exclamation-question-mark,
  -->
<!-- cspell:words subindex Ollama vLLM -->

> **Harden Review Report**
> Purpose: Harden requirements, make definitive decisions

## 1. Summary

- Document Reviewed: `specifications-index.md` / `-transport.md` / `-structured-output.md` /
  `-error-handling.md` / `-config-packaging.md`（分割仕様 5 ファイル）
- Document Type: Design Specification（split）
- Promotions: 3
- WHEN Extractions: 3
- Gap Fills: 4
- Decision Records Generated: 4（DR-14 〜 DR-17）

本レビューは explore レビュー（`reviews-claude-spec-explore-2026-09-02.md`）が挙げた
Questions 17 件 / Gaps 7 件 / Alternatives 4 件 / Assumptions 5 件を入力とし、
実コード（`model-utils.ts` / `run-ai.ts` / `segment-ai.ts`）を証拠として収束させた。

決定に至らなかった項目は 1 件のみである。G-07（AC-020 の検証手段が非規範コメントにしかない）は、
要件 v1.5.0 が REQ-NF-001 の内容を変えていないため本スコープの追随事項に当たらず、
規範への引き上げは仕様の再構成に相当すると判断して据え置いた。

## 2. SHOULD to MUST Promotions

Requirements promoted from SHOULD to MUST with justification.

### P-01: `specifications-transport.md` §3.1 Input Domain の期待値

- Original: サーバ位置値は、HTTP 経路が選択された場合に限り、スキーム付きの絶対 URL である
  ことが **期待される**
- Promoted: サーバ位置値は、HTTP 経路が選択された場合、`http` または `https` スキームを持つ
  絶対 URL である。これを満たさない値は R-006 により設定エラーとして扱われる
- Justification: 「期待される」は入力仮定の記述にとどまり、満たさない場合の帰結を持たない。
  R-006 が既に「絶対 URL でない」場合の throw を規定しているため、§3.1 の記述だけが
  規範性を欠いた状態にあった。許容スキームの限定は explore Q-09 が指摘した曖昧さを閉じる
- Evidence: `specifications-transport.md` R-006 / REQ-F-019 / DR-12。
  R-006 の目的は「ネットワークアクセス前に設定ミスを診断する」ことであり、
  `ws://` や `file://` を通過させると目的を満たさない
- DR Reference: DR-14

### P-02: `specifications-error-handling.md` §4.1 impl-note（R-004 の subindex）

- Original: 専用の subindex 名を設けるかは **実装判断**。REQUIREMENTS では ExitFailure 系との
  明確な区別が定義されていない（§7 Open Questions #1 として未決）
- Promoted: R-004 が扱う「成功ステータスだが本文が使えない」ケースは `ExitFailure` に収め、
  専用 subindex を新設しない
- Justification: `isRateLimitError` は `subindex === 'RateLimit'` のみを見て分岐し、
  `isFatalAiError` は `kind` のみを見る。したがって `ExitFailure` 以外の名前を与えても
  呼び出し元の分岐は変わらず、区別の追加は診断メッセージの粒度にしか効かない。
  診断は `detail` 文字列で表現でき、subindex を増やす理由が立たない
- Evidence: `_cle-libs/libs/ai/rate-limit-utils.ts`（`kind==='AiError' && subindex==='RateLimit'`）。
  既存実装も `run-ai.ts` で `ExitFailure` / `InvalidFormat` を detail の違いで使い分けている
- DR Reference: DR-16

### P-03: `specifications-config-packaging.md` §4 impl-note（判定対象の範囲）

- Original: impl-note（非規範コメント）に「判定対象は各 SKILL.md の deno run 記述行に加え、
  AI を直接呼ぶエントリスクリプトの shebang 行も含む」と記述
- Promoted: R-003 の本文へ移し、判定対象が `deno run` 記述行と shebang 行の双方であることを
  規範として述べる
- Justification: 同ファイルの §5 Edge Cases は既に「AI を呼ぶエントリスクリプトの shebang 行に
  ネットワーク権限フラグが欠けている → 不適合」を規範として持っており、
  規則本文（R-003）だけが対象範囲を述べていない。この不揃いが index §4 未決 #2 との
  食い違い（explore G-04）を生んでいる
- Evidence: 実リポジトリで shebang を持ち `runAI` を呼ぶエントリスクリプトは
  `classify-chatlogs.ts` / `filter-chatlogs.ts` / `set-frontmatter.ts` の 3 本
- DR Reference: —（既存の規範を規則本文へ移す整合であり、新たな決定を含まない）

## 3. WHEN Condition Extractions

Conditions extracted from ambiguous statements.

### W-01: `specifications-transport.md` R-002（URL 正規化）

- Original: HTTP 経路が選択されている → サーバ位置値を、末尾スラッシュ・`/v1` セグメントの
  有無に関わらず単一の正規 URL に解決する
- Extracted condition: WHEN サーバ位置値の末尾がスラッシュである / WHEN 除去後の末尾セグメントが
  `/v1` である
- Revised: WHEN HTTP 経路が選択されている場合、サーバ位置値から末尾のスラッシュを除去し、
  除去後の末尾セグメントが `v1` であればそれも除去し、得られた基底に `/v1/chat/completions` を
  連結した URL を用いる
- Rationale: 条件の出所は「explicit in source」。R-002 が挙げる 4 通りの表記
  （末尾スラッシュあり／`/v1` あり／両方あり／両方なし）は、この 2 つの条件の組み合わせに他ならない。
  R-002 は満たすべき性質のみを述べ、条件から結果への写像を書いていなかった（explore G-01 / Q-07）

### W-02: `specifications-structured-output.md` R-001（適用条件）

- Original: llama バックエンドが選択されており、呼び出し元が構造化出力（配列 / オブジェクト /
  YAML 契約）を要求する
- Extracted condition: WHEN llama バックエンドが選択されている（呼び出し元の要求は常に真である）
- Revised: WHEN llama バックエンドが選択されている場合、`response_format`（json_schema）を
  リクエストボディに含める。構造化出力を要求しない llama 呼び出しは想定しない
- Rationale: 条件の出所は「implicit in context」。呼び出し元 4 スキルはいずれも
  `parseAiJsonArray` または `extractYaml` を通しており、構造化出力を要求しない経路は実在しない。
  条件を残したまま帰結を書かないと、`transport` §4.1 Step 4 の「省略される場合」の
  応答の扱いが未定義のままになる（explore Q-03 / A-05）

### W-03: `specifications-error-handling.md` R-004（使えない成功応答）

- Original: HTTP 応答ステータスは成功だが、応答本文からアシスタントの発話テキストを取得できない
- Extracted condition: WHEN `choices` が空である / WHEN 本文がテキストでない /
  WHEN `finish_reason` が正常完了以外を示す
- Revised: WHEN 上記いずれかが成立する場合、`kind: AiError, subindex: ExitFailure` を throw する
- Rationale: 条件の出所は「domain knowledge」（OpenAI 互換 chat/completions の標準フィールド）。
  切り詰められた本文は「取得できてしまう」ため現行の条件には当たらず、
  構造化出力の目的を満たさない文字列が呼び出し元のパーサへ素通りしていた（explore G-03 / Q-02）

## 4. Gap-Filling Requirements

New requirements added to fill identified gaps.

### GF-01: リクエストボディに載るフィールドの閉じた集合

- Gap identified: explore G-02。`messages` と `response_format` 以外のフィールドについて、
  送る・送らないの判断がどのファイルにもない。`stream` を明示しない場合、要件が
  Out of Scope に置いたストリーミング応答へサーバ既定で入りうる
- New requirement: `specifications-transport.md` R-009: リクエストボディに含めるフィールドを
  `model` / `messages` / `stream`（値は false 固定）/ `response_format`（構造化出力時のみ）の
  4 つに限る。`temperature` / `top_p` / `max_tokens` 等は送らず、サーバ既定に委ねる
- Category: Request composition
- Rationale: 閉じた集合にすることで、サーバ実装ごとの既定値によって Out of Scope の振る舞い
  （ストリーミング）へ落ちる経路を塞ぐ。`max_tokens` を送らない判断は GF-02 と対で成立する
- DR Reference: DR-15

### GF-02: 切り詰め応答の失敗分類

- Gap identified: explore G-03。`finish_reason` に触れた規則がなく、切り詰められた本文が
  失敗として検知されない
- New requirement: `specifications-error-handling.md` R-004 の条件に
  「`finish_reason` が正常完了以外を示す」を加え、`ExitFailure` として分類する（W-03）
- Category: Response interpretation
- Rationale: `max_tokens` を送らない（GF-01）以上、切り詰めはサーバ既定に依存して起きうる。
  検知しないと、structured-output §4.1 が掲げた「スキーマ強制が効かないまま通常運転を続ける
  llama 経路は許容しない」という方針と実際の通り道が食い違う
- DR Reference: DR-15

### GF-03: 失敗系分類の一覧の所有

- Gap identified: explore G-05。`specifications-error-handling.md` §3.2 の Possible Outcomes が
  transport R-006 の `kind: InvalidFormat, subindex: InvalidEndpoint` を含まず、
  §2.1 の「`kind` は常に AI エラーを表す種別」が llama 経路全体では成り立たない
- New requirement: `specifications-error-handling.md` §3.2 が llama 経路の失敗系分類の
  唯一の一覧を持ち、transport R-006 の分類をそこへ再掲する。§2.1 の記述を
  「本仕様が分類する失敗は `AiError` を用いるが、経路全体では `InvalidFormat` も現れる」に改める
- Category: Cross-file ownership
- Rationale: transport §4.1 が結合順序を単独所有しているのと同じ扱い。分割仕様では、
  横断的な一覧を 1 ファイルが所有しないと呼び出し元が 2 ファイルを突き合わせることになる
- DR Reference: DR-16

### GF-04: 空配列受理が normalize に与える影響の判定

- Gap identified: explore G-06。`specifications-structured-output.md` §5.1 の表が
  「要確認。呼び出し元ごとに意図した結果かを判定する」で止まっていた
- New requirement: §5.1 の表に判定結果を書き込む。normalize は **適合** とする
- Category: Non-breaking verification（REQ-C-002）
- Rationale: `segment-ai.ts:129` 以降を検証した結果、空配列 `[]` は truthy のため
  `_parsed === null` 分岐に落ちず、`_result` は全ファイル `null` で初期化されたのち
  `_parsed` のループが 0 回で終わる。パース失敗時の `_nullMap()` と **戻り値が一致する**。
  差は診断ログのみ（`invalid JSON response` 1 件 → `no entry returned for` をファイルごとに出力）で、
  後者のほうが実態に即している。空配列を `null` 固定で検証する既存テスト 2 件も維持される
- DR Reference: —（DR-06 の射程内での検証結果であり、新たな決定を含まない）

## 5. Decision Records

### DR-14: llama 経路の識別子解決規則を確定する

**Phase**: review-harden
**Status**: Accepted

#### Context

REQ-F-015 の Rationale は「正規化規則そのもの（どの形式を正とするか）は specifications で
確定させる」と、この判断を明示的に spec へ委譲していた。しかし `specifications-transport.md`
R-002 は「単一の正規 URL に解決する」「重複・欠落したバージョンセグメントを生成しない」という
満たすべき性質のみを述べ、規則そのものを持っていなかった。トレーサビリティ上は
REQ-F-015 → R-002 で紐付いているため、委譲が受け取られていないことが見えにくい状態にあった。
併せて、モデル値の llama prefix の照合規則（大文字小文字・綴りの異形）と、R-006 が言う
「絶対 URL」の許容スキームも未定義だった。

#### Decision

llama 経路が入力を解決する規則を次の 3 点で確定する。

1. URL 正規化: サーバ位置値から末尾のスラッシュを除去し、除去後の末尾セグメントが `v1` で
   あればそれも除去し、得られた基底に `/v1/chat/completions` を連結する
2. 許容スキーム: `http` または `https` を持つ絶対 URL のみを受理し、それ以外は R-006 の
   設定エラーとする
3. provider prefix の照合: 既存のモデル名解決と同じく、大文字小文字を区別する完全一致とする
   （`Llama/qwen3-14b` は未知 provider として不正モデル名になる）

#### Alternatives Considered

- Option A（末尾正規化型）: 末尾スラッシュを落とし、末尾が `/v1` でなければ `/v1` を足し、
  最後に `/chat/completions` を連結する
- Option B（base + 固定パス型）: 末尾スラッシュと末尾の `/v1` を除去し、常に
  `/v1/chat/completions` を連結する（採用）
- Option C（URL API 依存型）: `new URL('v1/chat/completions', endpoint)` の標準解決に委ねる
- prefix 照合で大文字・小文字を区別しない案

#### Rationale

Option A と B は、REQ-F-015 が挙げる 4 通りの表記に対しても、`http://host:8080/api/v1` の
ようなサブパス付きの値に対しても同一の結果を返す。B を採るのは、連結するパスが
`/v1/chat/completions` という 1 つの定数として現れ、規則の読み手が結果を一意に予測しやすいためである。

Option C は不採用とする。`new URL('v1/chat/completions', 'http://host:8080/v1')` は
`http://host:8080/v1/chat/completions` を返すが、末尾スラッシュ付きの
`http://host:8080/v1/` に対しては `http://host:8080/v1/v1/chat/completions` を返す。
REQ-F-015 が求める「4 通りの表記の吸収」を単体では満たさない。

prefix 照合で大文字・小文字を区別しない案は不採用とする。`model-utils.ts` の
`_isKnownProvider` は `AI_PROVIDERS` への完全一致で判定しており、llama のためにここを緩めると
既存 provider の受理範囲まで広がる。REQ-C-002（既存バックエンドの非破壊）に照らして
既存の挙動をそのまま踏襲する。

許容スキームを `http` / `https` に限るのは、R-006 の目的が「ネットワークアクセス前に
設定ミスを診断する」ことにあるためである。`ws://` や `file://` を通過させると、
その先で別種の失敗として現れ、診断価値が失われる。

#### Consequences

- Positive:
  - REQ-F-015 が spec へ委譲した判断が受け取られ、実装者ごとの解釈差がなくなる
  - llama.cpp server / Ollama のいずれも `/v1` を持つ構成であり、両者を同じ規則で扱える
  - prefix 照合と許容スキームが定まり、不正入力の帰結が R-006 に一本化される
- Negative:
  - `http://host:8080/v1/v1` のような二重パスを持つ構成は、末尾 1 つだけを除去するため
    `/v1/v1/chat/completions` に解決される。この形を採る実装は現時点で確認していない
  - `Llama/...` のような表記ゆれは受理されず、利用者は不正モデル名のエラーを受け取る

---

### DR-15: リクエストボディを閉じたフィールド集合とし、切り詰め応答を失敗として分類する

**Phase**: review-harden
**Status**: Accepted

#### Context

`specifications-transport.md` R-003 は `messages` の構成を、`specifications-structured-output.md`
R-001 は `response_format` の有無を規定するが、それ以外のフィールドについて送る・送らないの
判断がどのファイルにもなかった。この空白は 2 つの具体的な穴を生んでいた。

1. `stream` を明示しない場合、サーバ実装の既定値によっては、要件が Out of Scope に置いた
   ストリーミング応答へ入りうる
2. `max_tokens` を明示しない場合、`finish_reason: "length"` で JSON が途中で切れた応答が返る。
   このとき HTTP ステータスは成功、`choices[0]` も存在し、本文もテキストとして取得できるため、
   `specifications-error-handling.md` R-004 にも `specifications-transport.md` R-007 にも
   該当せず、呼び出し元のパース失敗としてしか現れない

#### Decision

リクエストボディに含めるフィールドを `model` / `messages` / `stream`（false 固定）/
`response_format`（構造化出力時のみ）の 4 つに限る。`temperature` / `top_p` / `max_tokens` 等の
生成パラメータは送らず、サーバ既定に委ねる。

そのうえで、`specifications-error-handling.md` R-004 の条件に「`finish_reason` が正常完了以外を
示す」を加え、`kind: AiError, subindex: ExitFailure` として分類する。

併せて、構造化出力を要求しない llama 呼び出しは想定しないことを明示し、
`specifications-structured-output.md` R-001 の条件を「llama バックエンドが選択されている」に単純化する。

#### Alternatives Considered

- Option A: `max_tokens` を呼び出し元ごとに決めて送り、切り詰めを予防する
- Option B: 切り詰めに専用 subindex（例: `Truncated`）を設ける
- Option C: 生成パラメータを開いた集合とし、「列挙外はサーバ既定に委ねる」とだけ書く
- Option D: `stream` を明示せず、サーバ既定に委ねる

#### Rationale

Option A は不採用とする。送るべき `max_tokens` は呼び出し元の出力契約とモデルの
コンテキスト長の両方に依存し、4 スキル分の値を spec で決める根拠がない。
値を誤ると、切り詰めを予防するどころか正当な出力を切る側に倒れる。
検知（GF-02）で受けるほうが、値の当てずっぽうを持ち込まずに済む。

Option B は不採用とする。`isRateLimitError` は `subindex === 'RateLimit'` のみを見て分岐し、
`isFatalAiError` は `kind` のみを見る。`ExitFailure` 以外の名前を与えても呼び出し元の分岐は
変わらず、区別は診断メッセージにしか効かない。診断は `detail` 文字列で表現できる。

Option C は不採用とする。「列挙外はサーバ既定」と書くことは、`stream` の既定値に関する
判断を放棄することに等しく、Out of Scope への流入を塞げない。

Option D も同じ理由で不採用とする。OpenAI 互換を名乗るサーバの `stream` 既定は実装依存であり、
DR-09 が「互換を名乗ることを対応の根拠にしない」と決めた姿勢とも整合しない。

#### Consequences

- Positive:
  - Out of Scope に置いたストリーミング応答へ、サーバ既定によって入る経路が塞がれる
  - 切り詰め応答が fail-first の対象となり、構造化出力の目的を満たさない文字列が
    呼び出し元のパーサへ素通りしなくなる
  - リクエストボディの形が閉じるため、実測（REQ-F-016）の入力も一意に決まる
- Negative:
  - 生成パラメータを送らないため、出力の揺れをサーバ側の設定でしか調整できない
  - `finish_reason` を見る規則が増え、レスポンス解釈の分岐が 1 つ深くなる
  - 構造化出力を要求しない経路を想定しない判断は、将来そうした呼び出し元が現れた場合に
    R-001 の条件を戻す必要を生む

---

### DR-16: 失敗系分類の一覧を error-handling が単独で所有する

**Phase**: review-harden
**Status**: Accepted

#### Context

`specifications-error-handling.md` §3.2 の Possible Outcomes は `AiError` の 2 つの subindex と
不正モデル名のみを挙げ、`specifications-transport.md` R-006 が投げる
`ChatlogError(kind: InvalidFormat, subindex: InvalidEndpoint)` を含んでいなかった。
一方で同ファイル §2.1 は「`kind`（本仕様では常に AI エラーを表す種別）」と述べており、
llama 経路全体を見るとこの記述は成り立たない。呼び出し元が分岐条件を組み立てるには
2 ファイルを突き合わせる必要があった。

さらに `InvalidFormat` という語が 2 つの階層で別の意味を持っている。R-006 は
`kind: InvalidFormat` として使い、既存実装（`run-ai.ts`）は
`ChatlogError('AiError', 'InvalidFormat', ...)` と `AiError` 配下の subindex として使っている。

加えて、R-004 が扱う「成功ステータスだが本文が使えない」ケースに専用 subindex を設けるかが
§7 Open Questions #1 として未決のまま残っていた。

#### Decision

1. `specifications-error-handling.md` §3.2 が llama 経路の失敗系分類の唯一の一覧を所有し、
   transport R-006 の `InvalidFormat` / `InvalidEndpoint` をそこへ再掲する
2. §2.1 の「`kind` は常に AI エラーを表す種別」を、
   「本仕様が分類する失敗は `AiError` を用いるが、経路全体では設定エラーとして `InvalidFormat` も
   現れる」に改める
3. R-004 に専用 subindex を新設せず `ExitFailure` に収める（§7 Open Questions #1 を解決）
4. `InvalidFormat` の表記衝突は解消せず、既存実装の subindex 用法をそのまま残す。
   §3.2 の一覧に「`kind` として現れる `InvalidFormat` と `AiError` 配下の subindex `InvalidFormat` は
   別の意味を持つ」旨の注記を置く

#### Alternatives Considered

- Option A: 一覧を `specifications-index.md` に置き、索引から全体像を読めるようにする
- Option B: R-004 に専用 subindex（`Truncated` / `UnusableBody` 等）を設ける
- Option C: 既存実装の `AiError` / `InvalidFormat` を別名へ改め、語の衝突を解消する

#### Rationale

Option A は不採用とする。index は分割の索引とカバレッジを持つ層であり、規則そのものを
持たない構成で一貫している。ここに規範を置くと、index が「読めば全部わかるファイル」へ
肥大していく。transport §4.1 が結合順序を単独所有しているのと同じく、
失敗系の一覧も、規則を持つファイルに所有させるほうが揃う。

Option B は P-02 の根拠と同じ理由で不採用とする。呼び出し元の分岐は `kind` と
`subindex === 'RateLimit'` しか見ないため、名前を増やしても振る舞いは変わらない。

Option C は不採用とする。`run-ai.ts` の `ChatlogError('AiError', 'InvalidFormat', ...)` は
既存 5 バックエンドの失敗分類であり、名前を変えると REQ-C-002（既存バックエンドの
成功・失敗の分類を変えない）に抵触する。衝突は注記で扱う。

#### Consequences

- Positive:
  - 呼び出し元が 1 ファイルを読めば llama 経路の失敗系を把握できる
  - §7 Open Questions #1 が解決し、error-handling の未決が 0 件になる
  - 認証を要求する構成に当たった場合（401 / 403）の見え方も、同じ一覧の中で説明できる
- Negative:
  - transport R-006 の分類が 2 箇所に現れるため、変更時の同期先が 1 つ増える
  - `InvalidFormat` の語の衝突は残り、注記に依存して読み分けることになる

---

### DR-17: llama 経路は既存の `timeoutMs` を共有し、経路別の設定キーを設けない

**Phase**: review-harden
**Status**: Accepted

#### Context

`specifications-transport.md` R-004 は「既存 CLI 経路と同一のタイムアウト・キャンセル合成規則」を
適用するとし、値については触れていない。REQ-F-007 が求めているのはセマンティクスの一致であって
値の一致ではないため、経路別の値を持つ選択肢は要件と衝突しない。
一方でローカルモデルの cold start は分単位になりうるため、既存の値
（`config-schema` の既定 120,000ms、リポジトリの `config.yaml` は 300,000ms）で足りるかどうかが
暗黙の前提のまま残っていた。

#### Decision

llama 経路も既存の `timeoutMs` をそのまま用い、`llamaTimeoutMs` のような経路別の設定キーを
新設しない。cold start・モデルロード中の待ちは、DR-03 が定めた 503 / 504 の `RateLimit` 分類で
受けることを前提とする。

#### Alternatives Considered

- Option A: `llamaTimeoutMs` を新設し、未設定時は `timeoutMs` へ落とす
- Option B: llama 経路の既定値だけを引き上げる（設定キーは増やさない）

#### Rationale

Option A は不採用とする。設定キーの追加は `DEFAULT_CONFIG_SCHEMA` /
`DEFAULT_CONFIG_VALUES` / `config.yaml` / 配布ミラーの同時更新を伴い（C-5 / REQ-F-011）、
本スコープが `llamaEndpoint` 1 件に絞って払っているコストを 2 倍にする。
利用者は既に `timeoutMs` を `config.yaml` で調整でき、llama を使う構成では
その値を引き上げれば足りる。

Option B は不採用とする。同じキーの既定値が経路によって変わると、
`runAI` の呼び出し元から見た挙動が model 値に依存して変わり、
REQ-F-007 が保とうとした「経路の違いが挙動差として現れない」性質を損なう。

なお、この決定はサーバが応答を返さずに接続を保持し続ける実装に対しては
`TimedOut` として現れることを許容する。DR-03 が想定した 503 / 504 の分類は、
サーバが応答を返す実装にのみ効く。

#### Consequences

- Positive:
  - 設定面が広がらず、REQ-C-001（接続先指定は config.yaml のみ）の簡潔さが保たれる
  - 呼び出し元から見たタイムアウトの意味が経路を問わず 1 つに保たれる
- Negative:
  - cold start が既定値を超える構成では、利用者が `timeoutMs` を手で引き上げる必要がある
  - 応答を保持し続けるサーバ実装では、過負荷が `RateLimit` ではなく `TimedOut` として現れ、
    `runChunked` の中断ロジックには乗らない

---

## 6. Review Metadata

- Reviewer: AI (deckrd review --phase harden)
- Review Phase: harden
- Review Date: 2026-09-02
- Document Version Reviewed:
  - `specifications-index.md` v1.1.2
  - `specifications-transport.md` v1.2.0
  - `specifications-structured-output.md` v1.2.0
  - `specifications-error-handling.md` v1.0.3
  - `specifications-config-packaging.md` v1.1.2
- Upstream: requirements.md v1.5.0 / decision-records.md v2.0.0
- Input: `reviews-claude-spec-explore-2026-09-02.md`
- Total DRs Generated: 4（DR-14 〜 DR-17）
