---
title: "Review: libs/ai-backend specifications (split, 5 files)"
phase: explore
persona: Design Reviewer
document: "docs/.deckrd/libs/ai-backend/specifications/"
date: "2026-09-02"
status: draft
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-exclamation-question-mark
-->

<!-- cspell:words subindex Ollama vLLM -->

> **Explore Review Report**
> Persona: Design Reviewer
> Purpose: Initial exploration, identify gaps and alternatives

## 1. Summary

- Document Reviewed: `specifications-index.md` / `-transport.md` / `-structured-output.md` /
  `-error-handling.md` / `-config-packaging.md`（分割仕様 5 ファイル）
- Document Type: Design Specification（split）
- Total Questions: 17
- Total Concerns: 12（Gaps 7 / Implicit Assumptions 5）

本レビューは要件 v1.5.0・decision-records v2.0.0 への追随を終えた直後の状態
（transport 1.2.0 / structured-output 1.2.0 / error-handling 1.0.3 /
config-packaging 1.1.2 / index 1.1.2、コミット `25a8eade5`）を対象とする。

所見の重心は 3 つに集まった。

1. **要件が spec へ明示的に委譲した項目のうち、まだ確定していないものがある**
   （URL 正規化の「正」の形）
2. **リクエストボディの生成規則が、`messages` と `response_format` 以外を扱っていない**
   （`stream` / `max_tokens` / `finish_reason` の系統）
3. **分割の継ぎ目に落ちた関心事がある**
   （エラー分類の全体像、index の未決 #2 と config-packaging の Edge Case の食い違い）

## 2. Questions & Concerns

Questions and observations raised during exploration.

### 2.1 Completeness

Are all scenarios covered?

- Q-01: リクエストボディに載る **フィールドの集合** が、どのファイルでも確定していないのではないか。
  transport R-003 は `messages` の構成を、structured-output R-001 は `response_format` の有無を
  規定するが、`model` 以外にどのフィールドを送り、どれを送らないのかを述べた箇所がない。
  とくに `stream` を明示しない場合、要件の Out of Scope が除外した「ストリーミング応答」を
  サーバ実装の既定値によって踏んでしまう余地が残る。`stream: false` を明示する側に倒すか、
  「明示しないフィールドはサーバ既定に委ねる」と書く側に倒すかを検討する価値がある。

- Q-02: `max_tokens` を送らない場合の **切り詰め応答** が、どの規則にも当たらないのではないか。
  ローカルサーバの既定 `max_tokens` が小さいと、`finish_reason: "length"` で JSON が途中で
  切れた応答が返る。このとき HTTP ステータスは成功、`choices[0]` も存在し、本文もテキストとして
  「取得できてしまう」ため、error-handling R-004（本文からテキストを取得できない）には該当せず、
  transport R-007 は先頭 choice をそのまま採用する。結果として構造化出力の目的を満たさない
  文字列が呼び出し元のパーサまで素通りし、`parseAiJsonArray` の失敗として現れる。
  fail-first の診断価値という観点から、`finish_reason` を見る規則を置くかどうかを検討したい。

- Q-03: **構造化出力を要求しない llama 呼び出し** の振る舞いが未定義ではないか。
  structured-output R-001 は「呼び出し元が構造化出力を要求する」を条件に置き、
  transport §4.1 Step 4 は「構造化出力が要求された場合のみ」省略されると述べる。
  つまり要求しない経路が形式上は存在するが、その場合に応答テキストをどう扱うかを述べた規則がない。
  現行 4 スキルはすべて構造化出力を要求するため実害は出にくいが、この分岐が
  「起こりえない」のか「起こりうるが未規定」なのかを明示しておくと、実装時の判断が減る。

- Q-04: structured-output §5.1 の impl-note が指摘する **normalize の空配列挙動** について、
  どちらが意図した結果なのかの判断が §7 Open Questions に上がっていないのではないか。
  同 note は「normalize の segment ループは空配列だと全ファイル null のまま返る」「既存テスト 2 件が
  空配列を null 固定で検証している」と、REQ-C-002 の「要確認」に正面から当たる事実を挙げている。
  §5.1 の表は「要確認。呼び出し元ごとに意図した結果かを判定する」で止まっており、
  判定そのものは誰の宿題なのかが読み取りにくい。

- Q-05: **エラー分類の全体像** を持つファイルがないのではないか。
  error-handling §3.2 の Possible Outcomes は `AiError` の 2 つの subindex と不正モデル名のみを挙げ、
  transport R-006 が投げる `ChatlogError(kind: InvalidFormat, subindex: InvalidEndpoint)` を含まない。
  一方 error-handling §2.1 は「`kind`（本仕様では常に AI エラーを表す種別）」と述べており、
  llama 経路の失敗が `AiError` に限られないことと整合していない。
  失敗系の一覧をどちらのファイルが所有するのかを決めておくと、呼び出し元の分岐設計が楽になる。

- Q-06: REQ-F-016 の **実測結果の記録先** が spec 本文（structured-output §4.1 の表）でよいのかを
  再考する余地がある。実測ゲートは実装着手前に 1 回通す性質のもので、後から参照されるのは
  「いつ・どのサーバ実装の・どのバージョン・どのモデルで測ったか」という再現情報である。
  §4.1 の表は分岐の帰結を記述する構造で、これらの列を持っていない。

### 2.2 Ambiguity

Are terms clearly defined?

- Q-07: transport R-002 の「**単一の正規 URL**」が、どの形を正とするのかを述べていないのではないか。
  REQ-F-015 の Rationale は「正規化規則そのもの（どの形式を正とするか）は specifications で
  確定させる」と、この判断を明示的に spec へ委譲している。しかし R-002 の Outcome は
  「末尾スラッシュ・`/v1` セグメントの有無に関わらず単一の正規 URL に解決する」「重複・欠落した
  バージョンセグメントを生成しない」という **性質の記述** にとどまり、規則そのものが書かれていない。
  Edge Cases も「いずれも同一の正規 URL に解決される」と述べるだけで、その URL を特定していない。
  同じ性質を満たす規則は複数あるため、実装者ごとに違う結果へ着地しうる（ALT-02 参照）。

- Q-08: 「**llama provider prefix を持つ**」（transport R-001）の照合規則が未定義ではないか。
  大文字小文字を区別するか（`Llama/qwen3` は受理されるか）、prefix の綴りは `llama` 単一か、
  前後の空白をどう扱うかが、どのファイルからも読み取れない。
  error-handling R-005 が `<provider>/<model>` の分解規則（最初のスラッシュで分ける）を
  持っているので、その延長として prefix 照合の規則を置ける位置はある。

- Q-09: transport R-006 の「**絶対 URL でない**」の判定基準が曖昧ではないか。
  許容するスキームを `http` / `https` に限るのか、スキーム付きでありさえすればよいのかで、
  `ws://host:8080` や `file:///tmp` のような値の扱いが変わる。
  「ネットワークアクセス前に設定ミスを診断する」という R-006 の目的からすると、
  スキームの限定まで含める側に寄せる余地がある。

- Q-10: `InvalidFormat` という語が **kind と subindex の両方** で使われており、読み手が混乱しうる。
  transport R-006 は `kind: InvalidFormat, subindex: InvalidEndpoint` を投げる一方、
  既存実装（`run-ai.ts`）は `ChatlogError('AiError', 'InvalidFormat', ...)` と、同じ語を
  `AiError` 配下の subindex として使っている。両者は別の意味を持つが表記が同一のため、
  ログや例外メッセージだけを見た読み手が取り違える余地がある。

- Q-11: structured-output が言う「**object envelope**」と「**既存の YAML 契約の形**」が、
  いずれも具体を持たないのではないか。
  前者は §2.2 と Edge Cases で「配列を envelope へ包み受信後に展開する」とされるが、
  包むフィールドの名前が決まっていない。§4.2 が実測すべきスキーマの 1 番目に
  「配列を包む object envelope」を挙げている以上、実測の入力を一意に決めるうえで
  この名前が必要になる可能性がある。
  後者は R-007 が「受信した JSON を既存の YAML 契約の形へ変換して返す」と述べるが、
  実コードの `extractYaml` は `Result<Record<string, unknown>>`（`{ ok, value }` 形）を返す。
  変換先が `Result` を含む形なのか、その中身の `Record` なのかが読み取れない。

### 2.3 Alternatives

What other approaches exist?

- Q-12: URL 正規化には少なくとも 3 つの実現方法があり、いずれも R-002 の性質を満たす（ALT-02）。
  どれを選ぶかで、`http://host:8080/api` のようなサブパス付きの値や、
  Ollama のようにパス prefix を持つ構成の受理可否が変わる。

- Q-13: 切り詰め応答（Q-02）の扱いには複数の落とし所がある（ALT-04）。
  `ExitFailure` に寄せる、専用 subindex を設ける、そもそも `max_tokens` を送って予防する、
  のいずれもありうる。

- Q-14: タイムアウトの既定値を llama 経路でも共有するか、別に持つかという分岐がある（ALT-03）。
  REQ-F-007 が要求しているのは **セマンティクスの一致** であって値の一致ではないため、
  値を分ける選択肢は要件と衝突しない。

### 2.4 Assumptions

Are implicit assumptions stated?

- Q-15: 現行の `timeoutMs`（`config-schema` の既定 120,000ms、リポジトリの `config.yaml` は
  300,000ms）が、ローカルモデルの応答時間に対して十分だという前提が、どこにも書かれていない。
  DR-03 は「サーバの起動・モデルロードは運用側の責務」とし、cold start を 503 / 504 として
  扱う想定を置いているが、**サーバが応答を返さないまま時間を消費する** ケース（ロード中に
  接続を保持し続ける実装）はタイムアウト側に現れる。

- Q-16: llama サーバが `Content-Type` の `charset=utf-8` を尊重するという前提が、
  transport R-008 の裏側に置かれている。REQ-F-016 の実測項目は `response_format` に限られており、
  文字符号化の往復は実測対象に入っていない。

- Q-17: 「認証を要求しない LAN 上のサーバ」という前提（transport §2.2 / 要件 §2 Assumptions）が
  崩れた場合の検知経路が書かれていない。認証を要求する構成に当たると 401 / 403 が返り、
  error-handling R-003 により `ExitFailure` になるが、これが「設定ミス」なのか
  「前提の崩れ」なのかを利用者が読み取れる材料は残らない。

## 3. Ambiguous Terms

| Term                  | Context                                        | Clarification Needed                                                                         |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 単一の正規 URL        | transport R-002 / Edge Cases / REQ-F-015       | どの形を正とするか。正規化アルゴリズムそのものが未記述（Q-07 / ALT-02）                      |
| llama provider prefix | transport R-001 / config-packaging R-002       | 大文字小文字の扱い、綴りの異形、前後の空白の扱い（Q-08）                                     |
| 絶対 URL              | transport R-006 / REQ-F-019                    | 許容スキームを `http` / `https` に限るか、スキーム付きなら何でもよいか（Q-09）               |
| object envelope       | structured-output §2.2 / §4.2 #1 / Edge Cases  | 配列を包むフィールドの名前。実測入力を一意に決める材料として要るか（Q-11）                   |
| 既存の YAML 契約の形  | structured-output R-007 / §2.2 / REQ-F-018     | `extractYaml` が返す `Result<Record<string, unknown>>` の全体か、その `value` 部分か（Q-11） |
| `InvalidFormat`       | transport R-006（kind）/ 既存実装（subindex）  | 同一の語が 2 つの階層で別の意味を持つ。表記を分けるか、衝突を許容すると明記するか（Q-10）    |
| 過負荷系ステータス    | error-handling R-002 / DD-01 / REQ-F-005       | 429 / 503 / 504 の 3 つに閉じた集合か、将来の追加を許す開いた集合か                          |
| AI を呼ぶ実行経路     | config-packaging R-003 / impl-note / REQ-F-010 | SKILL.md の `deno run` 行と shebang 行の双方を含むかが、index の未決 #2 と食い違う（G-04）   |

## 4. Alternatives to Explore

### ALT-01: 実測ゲートの記録先

- Current approach: 実測結果を `specifications-structured-output.md` §4.1 の表へ書き戻し、
  「どの分岐に着地したか」の記録へ置き換える（§4.2 末尾 / index 未決 #1）
- Alternative: `reviews-*.md` と同じ階層に独立した実測レポート（例: `measurements-response-format-<date>.md`）を置き、spec 側は結論と参照リンクのみ持つ
- Trade-offs: 前者は参照先が 1 つで済むが、実測日・サーバ実装名・ビルド/バージョン・モデル名・
  リクエスト本文といった再現情報を置く場所がない。後者は再現情報を素直に持てるが、
  spec と測定記録の 2 箇所を同期させる必要が生まれる。対応サーバを増やすたびに実測が要る
  （DR-09 Consequences）ため、記録が 1 件で終わらない点も判断材料になる
- Consider exploring: 実測が「1 回で終わる作業」か「サーバ実装ごとに積み上がる台帳」かを先に決めると、
  記録先はそこから決まりそうに見える

### ALT-02: URL 正規化規則の候補

- Current approach: R-002 は満たすべき性質（4 通りの表記が同じ URL に解決される、
  重複・欠落したバージョンセグメントを作らない）のみを述べ、規則を確定していない
- Alternative A（末尾正規化型）: 値の末尾スラッシュを落とし、末尾が `/v1` で終わらなければ `/v1` を
  足し、最後に `/chat/completions` を連結する
- Alternative B（base + 固定パス型）: 値を base URL とみなして末尾の `/v1` と `/` を除去し、
  常に `/v1/chat/completions` を連結する
- Alternative C（URL API 依存型）: `new URL('v1/chat/completions', endpoint)` のように
  標準の解決規則へ委ね、`/v1` の有無は利用者の責務とする
- Trade-offs: A と B は `http://host:8080/api/v1` のようなサブパス付きの値で挙動が分かれる
  （A は `/api/v1/chat/completions`、B も同じ結果になるが、`/api/v1/v1` のような入力で差が出る）。
  C は規則が短く済む反面、`http://host:8080/v1` と `http://host:8080/v1/` で結果が変わり、
  REQ-F-015 が挙げる 4 通りの吸収という目的を単体では満たさない
- Consider exploring: 対象に含める構成（llama.cpp server は `/v1` を持ち、Ollama も `/v1` を持つ）を
  先に列挙し、その実例を 4 通りの表記に展開して各案を突き合わせると、選択が具体になりそうに見える

### ALT-03: llama 経路のタイムアウト値

- Current approach: transport R-004 は「既存 CLI 経路と同一のタイムアウト・キャンセル合成規則」を
  適用するとし、値については触れていない（既定 120,000ms / リポジトリ設定 300,000ms を共有する読み）
- Alternative: `llamaTimeoutMs` のような経路別のキーを設け、未設定時は `timeoutMs` に落ちる
- Trade-offs: 共有は設定キーが増えず、REQ-F-007 の「同じセマンティクス」とも素直に整合する。
  一方でローカルモデルの cold start は分単位になりうるため、CLI 経路に合わせた値だと
  「サーバは生きているがタイムアウトで落ちる」状態が起きうる。経路別キーは
  REQ-C-001（接続先指定は config.yaml のみ）と衝突しないが、設定面が広がる
- Consider exploring: DR-03 が 503 / 504 を RateLimit に寄せた狙い（cold start を中断で受ける）が、
  「サーバが応答を返さずに接続を保持する」実装でも成立するかどうか

### ALT-04: 切り詰め応答（`finish_reason`）の扱い

- Current approach: `finish_reason` に触れた規則がなく、切り詰められた本文は
  transport R-007 で採用され、呼び出し元のパース失敗として現れる
- Alternative A: error-handling に「`finish_reason` が正常完了を示さない」場合を
  `ExitFailure` として分類する規則を足す
- Alternative B: 専用 subindex（例: `Truncated`）を設け、設定ミスと区別できるようにする
- Alternative C: リクエストに `max_tokens` を明示して予防し、分類は増やさない
- Trade-offs: A は既存の subindex を増やさずに fail-first の診断価値を回復できる。
  B は原因が読み取りやすくなる反面、error-handling §7 の未決（R-004 専用 subindex を作るか）と
  同種の判断を 2 つ抱えることになる。C は根本を減らせるが、送るべき `max_tokens` を
  呼び出し元ごとに決める必要が生まれ、Q-01 の「送るフィールドの集合」の議論に戻る
- Consider exploring: A と C は排他ではないため、両方を採る案も比較対象に入れる価値がある

## 5. Implicit Assumptions

Assumptions identified that should be made explicit.

### A-01: 既存の `timeoutMs` がローカルモデルの応答時間に足りる

- Assumption: llama 経路も既存の `timeoutMs`（既定 120,000ms、リポジトリ設定 300,000ms）で
  運用できる
- Location: `specifications-transport.md` R-004 / §2.2 Design Assumptions
- Risk if incorrect: モデルロード中に接続を保持する実装だと、503 / 504 へ落ちるより先に
  タイムアウトへ着地する。DR-03 が RateLimit 分類で狙った「並列度を落として中断する」経路には
  乗らず、`TimedOut` として扱われるため、運用者から見た原因が変わる
- Suggestion: Consider stating explicitly（値を共有する判断そのものを §2.2 に置く / ALT-03）

### A-02: サーバが `charset=utf-8` を尊重する

- Assumption: `Content-Type: application/json; charset=utf-8` を送れば、サーバは本文を
  UTF-8 として解釈し、応答も UTF-8 で返す
- Location: `specifications-transport.md` R-008（§4.2）
- Risk if incorrect: 日本語のチャットログ本文とプロンプトが往復で壊れる。
  AC-021 は「文字化け・欠落なく返る」ことを判定基準に置いているが、
  REQ-F-016 の実測項目は `response_format` の 3 種に限られており、符号化の往復は含まれない
- Suggestion: Consider stating explicitly（実測ゲートに非 ASCII 往復を 1 件足すかどうかを検討する）

### A-03: `subindex` は自由記述で、新しい値の追加に定数の変更が要らない

- Assumption: `InvalidEndpoint` のような新しい subindex を、既存の定数定義へ触れずに導入できる
- Location: `specifications-error-handling.md` §2.1 / `specifications-transport.md` R-006 / DR-12
- Risk if incorrect: DR-12 は「新しい `kind` の新設は本スコープを超える」として
  既存 kind の再利用を選んでおり、この判断は subindex 側が自由に増やせることに依存している。
  実コードでは `ChatlogError` の `subindex` が `string` 型で受けられており前提は成立するが、
  spec 側にはその根拠が書かれていない
- Suggestion: Consider stating explicitly（§2.1 の「自由記述の subindex」に、
  値の追加が定数変更を伴わないことまで含める）

### A-04: llama サーバが認証を要求しない

- Assumption: 宅内 LAN の信頼済みネットワーク上で動作し、API キー / Bearer token を求めない
- Location: `specifications-transport.md` §2.2 / 要件 §2 Assumptions（Out of Scope でも宣言）
- Risk if incorrect: 401 / 403 が error-handling R-003 により `ExitFailure` へ落ちる。
  分類としては妥当だが、「認証が要る構成に当たった」という情報は残らず、
  利用者は 404 や到達不能と同じ見え方の失敗を受け取る
- Suggestion: Consider stating explicitly（前提が崩れたときの見え方を Edge Cases に 1 行置くと、
  別 issue へ送る判断がしやすくなりそうに見える）

### A-05: 現行 4 スキルはすべて構造化出力を要求する

- Assumption: llama 経路を通る呼び出しに「構造化出力を要求しない」ものは実在しない
- Location: `specifications-structured-output.md` R-001 の条件 / `specifications-transport.md`
  §4.1 Step 4（「構造化出力が要求された場合のみ」省略）
- Risk if incorrect: 要求しない経路の応答をどう扱うかの規則がないため、実装者が
  「素通しで返す」「エラーにする」のどちらかを推測で選ぶことになる
- Suggestion: Consider stating explicitly（起こりえないなら Non-Goals へ、起こりうるなら
  規則を 1 つ足す、のどちらに寄せるかを決める）

## 6. Gaps Identified

Areas where coverage may be incomplete.

### G-01: URL 正規化規則そのものが確定していない

- Area: `specifications-transport.md` R-002 / Edge Cases / §6 Traceability
- Missing: 4 通りの表記をどの形へ落とすかという規則。現状は満たすべき性質のみ
- Impact: REQ-F-015 の Rationale が「正規化規則そのもの（どの形式を正とするか）は
  specifications で確定させる」と明示的に委譲した項目が、spec 側で受け取られていない状態にあたる。
  要件 → spec のトレーサビリティ上、REQ-F-015 は R-002 に紐付いているため、
  一見すると充足しているように読める点が見つけにくさにつながっている
- Suggestion: ALT-02 の 3 案を対象サーバ（llama.cpp server / Ollama）の実 URL に当てて比較し、
  R-002 の Outcome を規則の記述へ置き換えることを検討する

### G-02: リクエストボディに載るフィールドの集合が未規定

- Area: `specifications-transport.md` R-003 / `specifications-structured-output.md` R-001
- Missing: `messages` と `response_format` 以外（`model` / `stream` / `max_tokens` / `temperature` 等）について、送る・送らないの判断
- Impact: `stream` を明示しないと、要件が Out of Scope に置いた「ストリーミング応答」へ
  サーバ既定で入りうる。`max_tokens` を明示しないと G-03 の切り詰めが起きうる
- Suggestion: 「送るフィールドの閉じた一覧」を置くか、「列挙外はサーバ既定に委ねる」と
  明記するかのいずれかを検討する

### G-03: 切り詰め応答（`finish_reason`）を扱う規則がない

- Area: `specifications-error-handling.md` §4.1（R-001〜R-004）/ `specifications-transport.md` R-007
- Missing: 成功ステータス・`choices[0]` 存在・本文はテキスト、しかし内容が途中で切れている場合の分類
- Impact: 構造化出力の強制という REQ-F-003 の目的を満たさない応答が、失敗として検知されないまま
  呼び出し元のパーサへ渡る。structured-output §4.1 が「スキーマ強制が効かないまま通常運転を
  続ける llama 経路は許容しない」と述べた方針と、実際の通り道が食い違いうる
- Suggestion: ALT-04 の A / B / C を比較する。error-handling §7 の未決（R-004 専用 subindex）と
  同じ判断軸なので、まとめて扱う余地がある

### G-04: index の未決 #2 と config-packaging の Edge Case が食い違っている

- Area: `specifications-index.md` §4 未決 #2 / `specifications-config-packaging.md` §5 / §4 impl-note
- Missing: 整合。index は「要件 REQ-F-010 の対象表が shebang 行を挙げていない」ことを
  **未決** として掲げているが、config-packaging は §4 impl-note で「判定対象は…shebang 行も含む」と述べ、
  §5 Edge Cases に「AI を呼ぶエントリスクリプトの shebang 行にネットワーク権限フラグが
  欠けている → 不適合」という行を既に持っている。spec 側では実質的に決着している論点が、
  index では未決のまま残っている
- Impact: 索引だけを読む読み手には「未決」に見え、config-packaging を読む読み手には「決着済み」に見える。
  次の追随パスで、どちらかが誤って書き換えられる余地がある
- Suggestion: index の未決 #2 を「spec 側は shebang 行を対象に含める判断を採っており、
  要件の対象表がそれを反映していない」という **要件への差し戻し** として書き直すか、
  解決済みの表へ移すかを検討する

### G-05: 失敗系の全体像を所有するファイルがない

- Area: `specifications-error-handling.md` §2.1 / §3.2 / `specifications-transport.md` R-006
- Missing: llama 経路が投げうる `kind` / `subindex` の組の一覧。
  error-handling §3.2 は `AiError` 系と不正モデル名のみを挙げ、`InvalidFormat` / `InvalidEndpoint` を含まない
- Impact: 呼び出し元が分岐条件を組み立てるとき、2 ファイルを突き合わせる必要が生まれる。
  error-handling §2.1 の「`kind`（本仕様では常に AI エラーを表す種別）」という記述が、
  llama 経路全体では成り立たない
- Suggestion: error-handling が失敗系一覧を所有し、transport R-006 の分類をそこへ再掲する
  （または参照する）構成を検討する。分割仕様の継ぎ目としては、
  transport §4.1 が結合順序を単独で所有しているのと同じ扱いにできそうに見える

### G-06: 空配列受理が normalize に与える影響の判断が宿題として残っていない

- Area: `specifications-structured-output.md` §5.1 の表と impl-note
- Missing: 「normalize が空配列で全ファイル null を返すのは意図した結果か」という判断と、その担い手。
  §5.1 の表は「要確認」で止まり、§7 Open Questions には上がっていない
- Impact: REQ-C-002（既存バックエンドの非破壊）の適合判定が、実装時まで持ち越される。
  既存テスト 2 件が空配列を null 固定で検証しているため、実装段階で
  「テストを直すのか実装を直すのか」の判断が改めて必要になる
- Suggestion: §7 の未決として明示するか、§5.1 の表に判定結果を書き込むかを検討する

### G-07: AC-020（内部境界の分離）を判定する材料が非規範コメントにしかない

- Area: `specifications-transport.md` §4.1 末尾の impl-note / `specifications-index.md` §3
- Missing: 「分離された内部境界に置かれている」ことを何によって判定するかの基準。
  3 層分割（前段 / 中段 / 後段）の具体は impl-note にあるが、これは非規範として書かれている
- Impact: AC-020 は「`runAI` の実装を検査する」と述べるだけで、合否の線が引かれていない。
  REQ-NF-001 は規範として強い形で書かれている一方、検証可能性が実装者の解釈に委ねられる
- Suggestion: index §3 が「実装ノートが具体を持つ」と委譲している現状を是とするか、
  §2.5 に DD を 1 つ立てて規範側へ引き上げるかを検討する。
  なお本レビューの範囲では、要件 v1.5.0 が NF-001 の内容を変えていないため、
  追随の欠落ではなく設計判断として扱う余地がある

## 7. Review Metadata

- Reviewer: AI (deckrd review --phase explore)
- Review Phase: explore
- Review Date: 2026-09-02
- Document Version Reviewed:
  - `specifications-index.md` v1.1.2
  - `specifications-transport.md` v1.2.0
  - `specifications-structured-output.md` v1.2.0
  - `specifications-error-handling.md` v1.0.3
  - `specifications-config-packaging.md` v1.1.2
- Upstream: requirements.md v1.5.0 / decision-records.md v2.0.0
- Repository State: commit `25a8eade5`
