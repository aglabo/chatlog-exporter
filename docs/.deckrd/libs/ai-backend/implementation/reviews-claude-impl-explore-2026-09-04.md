---
title: "Review: libs/ai-backend implementation.md"
phase: explore
persona: Design Reviewer
document: "docs/.deckrd/libs/ai-backend/implementation/implementation.md"
date: "2026-09-04"
status: draft
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/no-exclamation-question-mark,
  ja-technical-writing/no-unmatched-pair,
  -->

<!-- cspell:words subindex Ollama vLLM aplys -->

> **Explore Review Report**
> Persona: Design Reviewer
> Purpose: Initial exploration, identify gaps and alternatives

## 1. Summary

- Document Reviewed: `implementation/implementation.md` v1.0.0
- Document Type: Implementation Plan
- Total Questions: 16
- Total Concerns: 12（Gaps 7 / Implicit Assumptions 5）

本レビューは、仕様 4 ファイルが codex レビューを反映し終えた直後に起こした初版
（`implementation.md` v1.0.0、コミット `fdb31c50c`）を対象とする。

所見の重心は 3 つに集まった。

1. **仕様規則（30 件）のカバレッジ表はあるが、受け入れ基準（AC 24 件）の検証マップがない**
   検査を求める AC-013 / AC-020 / AC-021 / AC-022 / AC-023 / AC-024 の帰属先 commit が読み取れず、
   BDD/RGR の Green 条件も Commit 6 以外に書かれていない
2. **commit を順に積んだときの中間状態が定義されていない**
   Commit 12 で経路が繋がってから Commit 13 で契約が指定されるまでの間、
   llama 経路の 6 呼び出しはすべて「出力契約なし」で動く。
   これは structured-output R-001 が「想定しない」と述べた状態にあたる
3. **Phase 0（実測ゲート）が生む上流の版上げに、本文書の追随する経路がない**
   Phase 0 の成果物は仕様の書き換えと版上げだが、`based-on` の再基準化に触れた記述がない

## 2. Questions & Concerns

Questions and observations raised during exploration.

### 2.1 Completeness

Are all scenarios covered?

- Q-01: §3 Rule Coverage は 30 の規範規則を commit へ割り当てているが、**AC（AC-001〜AC-024）を
  どの commit で検証するか** の対応が置かれていない。振る舞いを実装する AC は commit 本文から
  推測できるものの、「検査する」ことそのものが判定内容である AC はどこにも現れない。
  AC-013（テストダブル注入による HTTP 経路の unit 検証）、AC-020（内部境界の分離の検査）、
  AC-021（UTF-8 往復）、AC-022（既存テストスイート全通過）、AC-023（続行側が一括処理を止めない）、
  AC-024（`type` / `category` がフォールバック値へ落ちない）の 6 件がこれにあたる。
  規則カバレッジ表と同じ粒度で AC の割り当て表を持つことを検討してはどうか。

- Q-02: **各 commit のテスト戦略** が Commit 6（「既存 `run-ai` テスト全通過が Green の条件」）以外に
  書かれていない。このリポジトリは commit 単位で Red → Green → Refactor を回し、
  実装を `bdd-coder` へ 1 タスクずつ委譲する運用を採っている
  （`.claude/rules/bdd-cycle.md` / `workflow.md`）。委譲時に渡す情報として
  「テスト対象ファイルと関数名」「期待する振る舞い（正常系 / 異常系 / エッジケース）」
  「既存テストファイルのパス」が挙げられているが、本文書はそれらの材料を持っていない。
  各 commit に「どのレイヤ（unit / integration / functional / system）に何を書くか」を
  1〜2 行添える案を検討したい。

- Q-03: **Commit 12 と Commit 13 の間の状態** が定義されていないのではないか。
  Commit 7 が `RunAIOptions` に出力契約フィールドを足し、Commit 12 が `_runViaHttp` を
  `runAI` へ結線するが、6 つの呼び出し元が契約を指定するのは Commit 13〜16 である。
  したがって Commit 12 が着地した時点では、llama 経路を通るすべての呼び出しが契約を持たない。
  structured-output R-001 は「出力契約を指定しない llama 呼び出しは想定しない」と述べ、
  transport §4.1 は Step 4（スキーマ構築）と Step 7.5（検証と復元）を llama 経路では
  常に実行するとしている。契約が無い状態で Step 4 が何を組み立てるのかは、
  どちらの仕様も述べていない。commit の順序を見直すか、未指定時の扱いを 1 行置くかの
  いずれかを検討する余地がありそうに見える（ALT-02 参照）。

- Q-04: **Commit 3〜5 が着地してから Commit 12 までの中間状態** で、利用者が
  `model: llama/<model>` を設定した場合の見え方が書かれていない。Commit 3 は
  `AI_PROVIDERS` / `AI_PROVIDER_BACKEND_MAP` に `llama` を足すため、
  この時点で `llama/qwen3-14b` はモデル値として受理される。一方で経路判定は Commit 12 まで
  入らないため、`_buildCommand` の default 分岐へ到達しうる。Commit 3 は
  「経路判定を `_buildCommand` より前に置くため llama は到達しない」と述べるが、
  これが成立するのは Commit 12 以降である。中間状態を「起こりうるが許容する」とするか、
  Commit 3 で暫定的な拒否を置くかの判断が読み取れない。

- Q-05: **Phase 0 の実測が不合格だった場合** の分岐が、Phase 4 以外について書かれていない。
  Phase 6 の導入文は「Phase 0 の実測が長引いて Phase 4 が止まった場合」に (1) catch 拡張を
  先行させる案を持つが、Phase 5（HTTP トランスポート）が Phase 0 に依存するかどうかは
  明示されていない。実際には Commit 11 の Step 5（400 から `response_format` の拒否を読み分ける）が
  実測結果に依存する。また「対応対象外と判明した」場合に Phase 1〜3 と Phase 6 (1) を
  そのまま着地させるのか、ブランチごと畳むのかも読み取れない。

- Q-06: **Phase 0 完了後の上流版の再基準化** に触れた記述がない。Phase 0 の成果物は
  structured-output §4.1.1 と §7、および index §4 の未決 #1 / #2 の解消であり、
  いずれも仕様側の版上げを伴うと本文書自身が述べている。しかし frontmatter は
  `based-on: specifications-index.md v1.2.0` のまま Phase 4 以降を記述しており、
  Phase 4 に着手する時点では実在しない前提を指すことになる。
  `deckrd-rule-document-versioning` は下流が上流の版をピン留めする構成を採っているため、
  Phase 0 の完了条件に「本文書の `based-on` と該当 commit の記述を更新する」を含める案を
  検討したい。

- Q-07: **「impl で決着させる Open Items」6 件に、決着させる commit が割り当たっていない**。
  とくに `llama/<model>` の `<model>` が空文字・空白の場合の入力検証は、transport §7 が
  impl への申し送りとして名指しした論点であり、Commit 3（モデル値の受理）と
  Commit 12（結合順序の Step 2）のどちらで扱うかで、投げる分類が変わりうる。
  中断判定関数を `rate-limit-utils.ts` と新ファイルのどちらに置くかも Commit 5 の成果物に関わる。

- Q-08: Commit 17 の付与対象表に `scripts/aplys-tester.ts` の `buildDenoArgs` が入っていない一方、
  同 commit の本文は「**判断対象になる**」「実際に fetch を張る system テストを書くなら付与を要する」と
  述べている。付与するのかしないのかが読み取れない。system テストを書くかどうか自体が
  Q-02 のテスト戦略に依存するため、両者を同時に決める余地がある。

- Q-09: **error-handling §4.3 の非破壊 4 条件** が、Commit 2 / Commit 3 の完了条件になっていない。
  Commit 1 は REQ-C-002 の観測点を 3 つ明示しているのに対し、Commit 2 は
  「`kind` / `subindex` は変えない」までで止まる。§4.3 は「llama 追加前に受理されていたモデル値が
  追加後に拒否される」ことも不適合としているが、これを確かめる手立てが本文書にない。
  Commit 1 と同じ密度で観測点を置く案を検討したい。

- Q-10: **Commit 13〜16 と Commit 18 がミラー同期の対象か** が読み取れない。
  §3.4 の R-004 行は「1〜12 / 17」とし、末尾の「共有ライブラリのミラーについて」節は
  `.config/chatlog-exporter/**` / `deno.json` / `skills/_cle-libs/**` を同期対象として挙げる。
  Commit 13〜16 は呼び出し元スキル配下を編集するため対象外と読めるが、Commit 18 が触る
  「設定ドキュメント」の所在が特定されていないため、`.config/chatlog-exporter/` 配下を含むかが分からない。

### 2.2 Ambiguity

Are terms clearly defined?

- Q-11: **「観測点」** が 2 つの別の意味で使われている。Commit 1 は REQ-C-002 の非破壊判定として
  「呼び出し元の戻り値 / 永続化される出力 / 集計・キャッシュへの副作用」の 3 点を指し
  （structured-output §5.1）、Commit 12 は注入の等価性判定として「組み立てられたリクエスト /
  応答を解釈した結果」の 2 点を指す（transport §4.4）。どちらも「観測点」と書かれているため、
  文書を横断して読むと数が合わない印象を与える。呼び分ける語を当てる余地がある。

- Q-12: **「経路ラベル」** の値域が定まっていない。Commit 6 は「後段の例外メッセージが参照する
  `_spec.command` を経路ラベルへ置き換える」とし、transport §4.1.1 の impl-note は例として
  `'llama'` を挙げる。CLI 経路側のラベルが従来の `command` と同じ文字列なのか、
  バックエンド名（`claude` / `codex` 等）なのかで、既存の Aborted / TimedOut メッセージの
  文言が変わりうる。REQ-C-002 の観測範囲に例外メッセージが含まれるかとも関わる。

- Q-13: Commit 8 の `yaml` 契約の検証条件「**各値が許容型である**」の許容型が、どこで定まるのかが
  読み取れない。structured-output §4.3 は「`yaml` 契約のキー集合は `extractYaml` が要求するキーと
  完全一致させる」とキー集合については述べるが、値の型には触れていない。
  `line-prefixed` 側は「各値が文字列である」と閉じているため、対比として `yaml` 側の空きが目立つ。

- Q-14: Commit 4 は `DEFAULT_CONFIG_SCHEMA` の型を **`'string'`** と書き、
  config-packaging §2.2 / §3.1 は型語彙を **`text` と `number` の 2 種類** と述べている。
  実コード（`skills/_cle-libs/types/config-schema.types.ts:10`）の
  `ConfigFieldType` は `'string' | 'number'` であり、本文書の側が実態に一致している。
  仕様側の語が実装から外れている状態にあたるため、次の仕様更新の対象として拾う余地がある。

- Q-15: Commit 2 が `AiModelToProvider` の `regex` エントリに **表示ラベルのフィールドを追加** する
  という判断は、共有される型の形を変える。REQ-C-002 の非破壊は error-handling §4.3 が
  「モデル値の受理範囲」「既定モデル」「kind / subindex の組」の 3 軸で定めており、
  型定義の形はそのいずれにも当たらない。型を広げること自体は破壊にあたらないという理解でよいか、
  観測範囲に含めるかを明示しておくと Commit 2 の完了判定が楽になりそうに見える。

- Q-16: Phase 0 の 4 条件のうち「**実運用チャンク上限に近い入力長**」の具体値と、
  「モデル差（量子化レベルの違いを含む 2 種以上）」の対象モデルが定まっていない。
  また実測対象のサーバ実装（structured-output §7 は llama.cpp server を主対象とする）と
  そのビルド・バージョン・起動オプションが本文書に現れない。
  実測結果を仕様へ書き戻す以上、再現情報の置き場も同時に決まると読みやすくなりそうに見える
  （ALT-04 参照）。

## 3. Ambiguous Terms

| Term                           | Context                                           | Clarification Needed                                                             |
| ------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| 観測点                         | Commit 1（3 点）/ Commit 12（2 点）               | REQ-C-002 の非破壊判定と、注入の等価性判定で同じ語が別の集合を指す（Q-11）       |
| 経路ラベル                     | Commit 6 / Commit 12 / transport §4.1.1 impl-note | 値域。CLI 側が従来の command 文字列かバックエンド名か（Q-12）                    |
| 許容型                         | Commit 8 の `yaml` 契約検証                       | どの型を許容とするか。定義元が structured-output §4.3 に見当たらない（Q-13）     |
| 型 `'string'` / 型語彙 `text`  | Commit 4 / config-packaging §2.2・§3.1            | 実コードは `'string' \| 'number'`。仕様側の語が実態から外れている（Q-14）        |
| 実運用チャンク上限に近い入力長 | Phase 0 の 4 条件                                 | 具体値。実測の再現性に直結する（Q-16）                                           |
| 判断対象                       | Commit 17 の `aplys-tester.ts` `buildDenoArgs`    | 付与対象表に無いまま「判断対象になる」と書かれ、付与の可否が読み取れない（Q-08） |
| 設定ドキュメント               | Commit 18                                         | 所在。`.config/chatlog-exporter/` 配下ならミラー同期の対象になる（Q-10）         |
| 中断側判定関数                 | Commit 5 / Commit 13〜16 / Open Items             | 名称と配置が Open Items に残り、依存する 5 commit の記述が名前を持たない（Q-07） |

## 4. Alternatives to Explore

### ALT-01: Phase 6 の分割単位

- Current approach: 各スキルの commit で (1) catch の中断判定拡張と (2) 出力契約の指定を
  同時に行い、Phase 0 が長引いた場合にのみ 2 巡へ割る
- Alternative: 最初から 2 巡に固定する。Phase 2 直後に catch 拡張 4 commit を置き、
  契約指定 4 commit を Phase 4 の後へ移す
- Trade-offs: 現行案はスキルごとに 1 commit で閉じ、履歴が読みやすい。
  一方で Phase 6 全体が Phase 4 に依存するため、実測が止まると DR-18 の中核
  （設定漏れ・サーバ未起動が一括書き込みとして現れる不具合の解消）も止まる。
  2 巡案は Phase 0 の結果に関わらず DR-18 の効果が先に着地するが、
  同じファイルを 2 度触るため差分が分散する
- Consider exploring: DR-18 の解消が Phase 0 の合否と独立に価値を持つかどうかを先に決めると、
  分割単位はそこから決まりそうに見える

### ALT-02: 出力契約フィールドを未指定にできるかどうか

- Current approach: Commit 7 が `RunAIOptions` に任意フィールドとして追加する
  （「既存の任意フィールド追加であり既存呼び出し元が無改修で動く」ことを REQ-C-005 の
  許容範囲内である根拠としている）
- Alternative A: 任意のまま、llama 経路で未指定だった場合の扱い（throw する / 既定契約へ落とす）を
  1 行置く
- Alternative B: llama 経路に限り契約を持たない呼び出しを型レベルで表現できないため、
  実行時の検証として `InvalidEndpoint` と同種の設定エラーに寄せる
- Alternative C: Commit 13〜16 を Commit 12 より前に置き、契約指定が先に着地する順序へ変える
- Trade-offs: A / B は Q-03 の中間状態を仕様違反でない形に落とせるが、
  R-001 の「想定しない」という強い書き方は緩む。C は中間状態を作らずに済むが、
  契約フィールドを Commit 7 で足したうえで llama 経路が未結線のまま
  呼び出し元だけが先んじて指定する形となり、Phase 4 と Phase 6 の依存が逆転する
- Consider exploring: 「想定しない」が「起こりえない」なのか「起こりうるが未規定」なのかを
  先に決めると、A〜C の選択が具体になりそうに見える（spec explore A-05 と同じ軸）

### ALT-03: Commit 6（3 層分割）の位置

- Current approach: Phase 3 に置き、Phase 1 の DR-06 周辺修正（Commit 1・2）より後にする
- Alternative: Phase 1 より前、あるいは Commit 2 の直前に置く
- Trade-offs: Commit 2 は `run-ai.ts:216` 付近を、Commit 6 は同ファイルの構造全体を触る。
  現行順では Commit 2 の変更が Commit 6 の分割で移動する可能性がある。
  先に分割すると Commit 2 の差分が最終形の位置に落ちるが、
  「llama 非依存・先行」という Phase 1 の位置づけ（実測の結果に関わらず着地する）が薄まる
- Consider exploring: Commit 2 で触る箇所が中段（`_runViaCli`）と前段のどちらに属するかを
  先に見ると、衝突の有無が判断できそうに見える

### ALT-04: Phase 0 の実測記録の置き場

- Current approach: 実測結果を structured-output §4.1.1 の表と §7 へ書き戻し、
  index §4 の未決 2 件を解消する（本文書 Phase 0 の成果物）
- Alternative: `docs/.deckrd/notes/` または implementation ディレクトリに独立した実測レポートを置き、
  spec 側は結論と参照リンクのみを持つ
- Trade-offs: 前者は参照先が 1 つで済む。一方で実測日・サーバ実装名・ビルド・モデル名・
  リクエスト本文・4 条件それぞれの遵守率といった再現情報を置く列が §4.1.1 の表にない。
  後者は再現情報を素直に持てるが、2 箇所の同期が生まれる
- Consider exploring: 本論点は spec explore レビューの ALT-01 として一度挙がり、
  spec 側では「§4.1.1 へ書き戻す」に落ちている。impl で 4 条件を加えて記録量が増えたため、
  同じ判断が成立するかを再確認する価値がありそうに見える

## 5. Implicit Assumptions

Assumptions identified that should be made explicit.

### A-01: 空配列受理の影響判定を impl 時点で再確認しない

- Assumption: Commit 1 の「呼び出し元 3 箇所はいずれも適合と判定済み」「空配列を null 固定で
  検証している既存テスト 2 件」という記述を、そのまま実装時の前提として使える
- Location: Phase 1 Commit 1
- Risk if incorrect: この判定と件数は structured-output §5.1 が spec 段階で行ったものであり、
  その後のコード変更を織り込んでいない。件数が違えば Commit 1 の完了判定が空振りする。
  §5.1 自身も normalize について「個別確認を要する」と留保を残している
- Suggestion: Consider stating explicitly（件数を確定値として持つか、
  「実装時に再度数える」と書くかを決める）

### A-02: lefthook のフックがすべての commit で働く

- Assumption: `.config/chatlog-exporter/**` / `deno.json` / `skills/_cle-libs/**` に触れる commit は、
  pre-commit フックの自動同期により手編集なしでミラーが揃う
- Location: 「共有ライブラリのミラーについて」節 / §3.4 R-004
- Risk if incorrect: 同節自身が `--no-verify` と rebase replay での通り抜けに言及し、
  pre-push の `--check-head` を最後の砦としている。CI 上での検証や、
  各 commit の完了条件として `--check-staged` を回すかどうかは書かれていない
- Suggestion: Consider stating explicitly（AC-012 の検証を各 commit の完了条件に含めるか、
  Phase 末で 1 回とするか）

### A-03: `--allow-net` の付与対象が現在のファイル構成のまま変わらない

- Assumption: SKILL.md 4 ファイル・shebang 3 本・`deno.json` の `test:module` という
  対象の集合が、Commit 17 に到達する時点でも同じである
- Location: Phase 7 Commit 17
- Risk if incorrect: 要件 REQ-F-010 が「行番号は SKILL.md の編集により陳腐化するため識別子で示す」と
  したのと同じ理由で、ファイル集合も Phase 1〜6 の 16 commit を経た後に変わりうる。
  とくに `normalize-chatlogs` のスクリプトが shebang を持たないという前提は、
  Phase 6 の編集で変わる余地がある
- Suggestion: Consider stating explicitly（Commit 17 の直前に対象を数え直す手順を置く）

### A-04: 18 の commit が番号どおりの順序で着地する

- Assumption: Phase 0 → 1 → 2 → … → 7 の順に進み、途中で順序が入れ替わらない
- Location: §2 Implementation Plan 全体
- Risk if incorrect: Phase 6 の導入文だけが例外的な進め方（2 巡への分割）を持ち、
  他の Phase には代替順序が書かれていない。Q-03 / Q-04 の中間状態は、
  この直列前提が崩れると別の形で現れる
- Suggestion: Consider stating explicitly（各 Phase の着手条件を Phase 4 と同じ密度で書く）

### A-05: 呼び出し元のリトライループが `ResponseSchemaViolation` を拾わない

- Assumption: `setfm-frontmatter.ts` / `setfm-review.ts` の `maxRetry` ループは YAML パース失敗のみを
  対象とし、`runAI` が投げる転送エラーはループの外へ抜ける
- Location: Phase 6 Commit 16 / error-handling §2.1.1 impl-note
- Risk if incorrect: `ResponseSchemaViolation` は続行側の分類であり、
  「単一のレスポンスがたまたま契約に合わなかった」場合を含む。ローカルモデルでは
  この分類が繰り返し起きうるため、リトライで救えるケースと救えないケースの境目が
  運用上の見え方を決める。Commit 16 は「`runAI` の内側にリトライを足さない」と書くが、
  呼び出し元のループが拾うかどうかには触れていない
- Suggestion: Consider stating explicitly（Commit 16 に、この分類がループの外へ抜けることを 1 行置く）

## 6. Gaps Identified

Areas where coverage may be incomplete.

### G-01: AC の検証マップとテスト戦略が置かれていない

- Area: §3 Rule Coverage / §2 各 Commit
- Missing: AC-001〜AC-024 と commit の対応、および各 commit のテストレイヤ・Green 条件
- Impact: 次に来る `/deckrd tasks` は本文書を入力に取り、実装は commit 単位で
  `bdd-coder` へ委譲される。委譲時に渡すべき「期待する振る舞い」「既存テストファイルのパス」
  「使用するテストコマンド」の材料が本文書にないため、タスク側で作り直すか、
  実装エージェントの推測に委ねることになる。とくに AC-020（内部境界の分離）は
  transport §4.1.1 が 3 つの不適合条件を規範として持っているのに、
  Commit 6 の完了判定にそれが降りてきていない
- Suggestion: §3 と並ぶ「AC Coverage」表を置き、各 commit に 1 行のテスト方針を添えることを検討する
  （Q-01 / Q-02）

### G-02: 出力契約を持たない llama 経路の中間状態

- Area: Phase 4 Commit 7 / Phase 5 Commit 12 / Phase 6 Commit 13〜16
- Missing: Commit 12 着地後・Commit 13 着地前の振る舞い
- Impact: structured-output R-001 の「出力契約を指定しない llama 呼び出しは想定しない」と、
  transport §4.1 の「Step 4 と Step 7.5 は llama 経路では常に実行される」が、
  この期間の実装に対して具体的な指示を持たない。実装者が
  「throw する」「既定契約へ落とす」「スキーマを省く」のいずれかを推測で選ぶ余地がある
- Suggestion: ALT-02 の A〜C を比較し、選んだ扱いを Commit 7 または Commit 12 の本文へ 1 行置くことを検討する
  （Q-03）

### G-03: Phase 0 が不合格・保留となった場合の分岐

- Area: Phase 0 / Phase 4 / Phase 5 / Phase 6 導入文
- Missing: 実測が「黙殺・拒否」に着地した場合、および実測が完了しない場合の各 Phase の扱い
- Impact: Phase 6 だけが例外的な進め方を持ち、Phase 5 が Phase 0 に依存するかどうかが読み取れない。
  実際には Commit 11 の Step 5（400 の読み分け）が実測結果に依存し、
  「未決のまま残るもの」節もそれを認めている。
  対応対象外と判明した場合にブランチ全体をどう扱うかの記述もない
- Suggestion: Phase 4 と同じ密度で、Phase 5 の着手条件と不合格時の帰結を書くことを検討する（Q-05）

### G-04: Phase 0 後の上流版の再基準化

- Area: frontmatter `based-on` / §1.2 Reference / Phase 0 成果物
- Missing: Phase 0 が仕様を書き換えて版を上げた後、本文書がどの版を指すかの更新手順
- Impact: `deckrd-rule-document-versioning` は下流が上流の三部構成の版をピン留めする構成を採っている。
  Phase 0 完了後は `specifications-index.md v1.2.0` および §1.2 が列挙する 4 ファイルの版が
  いずれも古くなり、Phase 4 以降の記述が指す仕様を特定できなくなる
- Suggestion: Phase 0 の成果物一覧に「本文書の `based-on` と §1.2 の版表記を更新する」を
  加えることを検討する（Q-06）

### G-05: Rule Coverage の割り当てが commit 本文に現れていない箇所がある

- Area: §3.1 R-008 → Commit 10 / 11、§3.3 R-005 → Commit 2 / 3
- Missing: 割り当て先 commit の本文に、当該規則への言及がない
  - R-008（UTF-8 の符号化と復号）は Commit 10 の本文が符号化・復号の双方を述べており、
    Commit 11（レスポンス解釈）の本文には現れない
  - R-005（モデル値の受理判定と案内文言の実態追随）は Commit 2 の本文にあるが、
    Commit 3 の本文は REQ-F-001 / DR-02 / DR-14 決定 3 のみを引き、R-005 に触れていない
- Impact: §3 の冒頭は「割り当ての無い行が残った場合、それは表の欠落ではなく commit 分解の欠落を
  意味する」と述べており、表から commit へのリンクを規律として扱っている。
  逆方向（commit から規則へ）が片側だけ欠けていると、commit 単位でレビューする読み手が
  当該規則の担保を見落としうる
- Suggestion: 各 commit の見出し直下にある規則参照行へ、表と同じ規則 ID を揃えることを検討する

### G-06: Open Items に決着させる commit が割り当たっていない

- Area: 「impl で決着させる Open Items」節（6 件）
- Missing: 各項目をどの commit で決めるかの割り当て
- Impact: 6 件のうち少なくとも 3 件（契約フィールドの名称、中断判定関数の名称と配置、
  CLI バックエンド部分集合型の名称）は、それぞれ Commit 7 / Commit 5 / Commit 3 の
  成果物そのものを指している。`llama/<model>` の空モデル名の検証は Commit 3 と Commit 12 の
  どちらに属するかで、投げる分類（不正モデル名と `InvalidEndpoint` のいずれか）が変わりうる
- Suggestion: 各項目に決着させる commit 番号を添えることを検討する（Q-07）

### G-07: 部分適用時の可視の挙動

- Area: Phase 2 Commit 3 / Phase 5 Commit 12
- Missing: Commit 3〜5 のみが着地した状態で `model: llama/<model>` を設定した場合の挙動
- Impact: Commit 3 で `llama` が provider として受理されるようになるため、
  モデル名解決は通り、経路判定が無いまま CLI コマンド構築へ進みうる。
  Commit 3 の「llama は到達しない」という記述は Commit 12 以降の状態を述べたものであり、
  中間状態には当たらない。18 commit を複数の PR に分けて着地させる場合に表面化する
- Suggestion: 中間状態を許容するか、Commit 3 に暫定の拒否を置くかを決めることを検討する（Q-04）

## 7. Review Metadata

- Reviewer: AI (deckrd review --phase explore)
- Review Phase: explore
- Review Date: 2026-09-04
- Document Version Reviewed: `implementation.md` v1.0.0
- Upstream: `specifications-index.md` v1.2.0（transport v2.0.1 / structured-output v2.0.0 /
  error-handling v2.0.1 / config-packaging v1.2.0）/ `requirements.md` v1.6.0
- Repository State: commit `fdb31c50c`
