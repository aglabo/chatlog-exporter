---
title: "Review: libs/ai-backend specifications (split, 5 files)"
phase: fix
persona: Spec Auditor
document: "docs/.deckrd/libs/ai-backend/specifications/"
date: "2026-09-02"
status: draft
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- cspell:words subindex Ollama vLLM -->

> **Fix Review Report**
> Persona: Spec Auditor
> Purpose: Final cleanup, ensure consistency

## 1. Summary

- Document Reviewed: `specifications-index.md` / `-transport.md` / `-structured-output.md` /
  `-error-handling.md` / `-config-packaging.md`（分割仕様 5 ファイル）
- Document Type: Design Specification（split）
- Terminology Issues: 4
- Testability Issues: 5
- Structure Issues: 4
- Cross-Reference Issues: 4
- Typo/Grammar Fixes: 0

本監査は意味を変えない範囲の指摘に限る。新たな要件・制約は追加せず、
Decision Record も生成しない。harden レビュー（DR-14 〜 DR-17）で採択済みだが
spec 本文へ未反映の項目は、Cross-Reference の欠落として扱い、内容の是非には立ち入らない。

Typo は 0 件だった。直近の追随作業で「llama バックエインド」「この区別自体は既存の /
既存のレートリミット判定」の 2 件が既に修正されており、今回の走査では
助詞の重複・句読点の重複・全角半角の混在のいずれも検出されなかった。

## 2. Terminology Inconsistencies

Same concepts should use same terms throughout.

| Current Term                           | Recommended Term         | Occurrences | Locations                                        |
| -------------------------------------- | ------------------------ | ----------- | ------------------------------------------------ |
| `Backend selection`（2 つの別責務）    | 責務ごとに別名           | 2 定義      | transport §2.3 / error-handling §2.3, §4.2       |
| モデル値 / モデル識別子                | モデル値                 | 混在        | transport §2.3, §3.1, §4.1 / error-handling 全般 |
| サーバ位置値 / 接続先 / エンドポイント | サーバ位置値（規則本文） | 12 / 3 / 6  | transport / config-packaging / index             |
| 呼び出し側                             | 呼び出し元               | 1           | index §2                                         |

### T-01: `Backend selection` が 2 つの別責務に同じ名前で割り当てられている

- Terms used: `Backend selection`（transport §2.3: モデル値の prefix から HTTP 経路を選ぶ、REQ-F-001）/
  `Backend selection`（error-handling §2.3・§4.2: モデル識別子の受理判定、REQ-F-014）
- Recommended: transport 側を `Backend selection` のまま残し、error-handling 側を
  `Model identifier acceptance`（モデル識別子の受理判定）へ改める
- Rationale: transport §4.1 の結合順序表は両者を Step 1 と Step 2 に **分けて** 並べており、
  実行時には別の単位として扱われている。同名のままだと、§4.1 を読んだ実装者が
  Step 1 と Step 2 を同じ単位の 2 回評価と誤読しうる。transport 側を据え置くのは、
  §2.5 DD-01 / §6 Traceability / DR-02・DR-05 の Impact 欄が既にこの名前で書かれているため
- Locations to fix:
  - `specifications-error-handling.md` §2.3 Feature Decomposition の Unit 名
  - `specifications-error-handling.md` §2.3 Unit Interaction Map / Data Flow Diagram
  - `specifications-error-handling.md` §3.1 Input Domain の 2 箇所
  - `specifications-error-handling.md` §4.2 の見出し

### T-02: 同一対象に「モデル値」と「モデル識別子」の 2 表記がある

- Terms used:
  - モデル値: transport §2.3 / §3.1 / §4.1 Step 1 / §5
  - モデル識別子: transport §4.1 Step 2 / error-handling §2.2 / §3.1 / §4.2 / §5
- Recommended: モデル値
- Rationale: いずれも `config.yaml` の `model` キー、または `options.model` から得られる同じ
  文字列を指す。transport は 1 ファイル内で両表記を使っており（§4.1 の Step 1 と Step 2）、
  読み手が別の入力だと解釈しうる。要件側は REQ-F-014 で「モデル名」、REQ-F-001 で「model」と
  表記が揺れているため、spec 側で 1 つに寄せる価値がある
- Locations to fix:
  - `specifications-transport.md` §4.1 Step 2 の「モデル識別子の受理判定」
  - `specifications-error-handling.md` §2.2 / §3.1 / §4.2 / §5 の各所

### T-03: サーバ位置を指す語が 3 通りある

- Terms used: サーバ位置値（transport 12 箇所）/ 接続先（config-packaging 2 箇所、transport 1 箇所）/
  エンドポイント（transport 4 箇所、structured-output 1 箇所、config-packaging 1 箇所、index 1 箇所）
- Recommended: 規則本文（§4 Decision Rules）と Edge Cases では「サーバ位置値」に統一し、
  「接続先」は散文の言い換えとしてのみ残す。「エンドポイント」は設定キー名
  （`llamaEndpoint`）と節見出し（`Endpoint resolution` / `Endpoint configuration key`）に限る
- Rationale: 3 語が同じ対象を指すこと自体は文脈から読めるが、config-packaging §7 の
  「`llamaEndpoint` の値検証を設定の読み込み時点で行うか、エンドポイント解決側に委ねるか」の
  ように、1 文の中で設定キーと単位名が同じ語で現れる箇所がある
- Locations to fix:
  - `specifications-config-packaging.md` §2.2 / §7 の「接続先」
  - `specifications-transport.md` §2.2 の「接続設定（サーバ位置・モデル）」

### T-04: index §2 のみ「呼び出し側」を使っている

- Terms used: 呼び出し元（transport 8 / structured-output 24 / error-handling 10）/
  呼び出し側（index §2 の 1 箇所）
- Recommended: 呼び出し元
- Rationale: index §2 の error-handling 行は「分類が呼び出し側の並列実行中断へ届く経路」と書く一方、
  当の error-handling は一貫して「呼び出し元」を使う。索引と本体で語が変わる理由はない
- Locations to fix:
  - `specifications-index.md` §2 Specification Files 表の error-handling 行

## 3. Testability Issues

Requirements that cannot be objectively verified.

### TS-01: `specifications-transport.md` R-002（URL 正規化）

- Original: サーバ位置値を、末尾スラッシュ・`/v1` セグメントの有無に関わらず単一の正規 URL に
  解決する。重複・欠落したバージョンセグメントを生成しない
- Issue: 「単一の正規 URL」が特定されていないため、テストの期待値を書けない。
  4 通りの入力が互いに一致することは検証できるが、**どの URL に一致するべきか** を
  規則から導けない
- Suggested revision: 期待値を一意に定める記述へ置き換える
  （harden レビューの DR-14 が規則を確定済み。適用は `/deckrd spec` の担当）
- Verification method: 4 通りの表記を入力し、いずれも同一かつ規則が定める URL に解決されることを
  unit テストで検証する（REQ-F-012 の注入点により実ネットワークアクセス不要）

### TS-02: `specifications-structured-output.md` R-007（YAML 契約への変換）

- Original: 受信した JSON を既存の YAML 契約の形へ変換して呼び出し元へ返す
- Issue: 「既存の YAML 契約の形」の指す対象が一意でない。実装上の `extractYaml` は
  `Result<Record<string, unknown>>`（`{ ok, value }` 形）を返すため、変換先が
  この `Result` 全体なのか `value` 部分なのかでアサーションが変わる
- Suggested revision: 変換先を `extractYaml` の戻り値型で名指しするか、
  「呼び出し元が `extractYaml` の結果として受け取る値と同じ形」と言い換える
- Verification method: set-frontmatter が期待するフィールド集合を持つ JSON を注入し、
  変換後の値が既存の YAML 経路と同じ形で得られることを検証する

### TS-03: `specifications-transport.md` R-005（fetch 注入）

- Original: 呼び出し元がテストダブルを注入していればそれを用い、注入がなければ既定の呼び出し手段を
  用いる。両者の切り替えは呼び出し結果の意味に差を生じさせない
- Issue: 「呼び出し結果の意味に差を生じさせない」の判定手段が示されていない。
  何を比較すれば「差がない」と言えるのかが規則から読めず、合否の線が引けない
- Suggested revision: 差がないことの観測点（送信内容と応答解釈の結果）を明示する
- Verification method: 同一入力に対し、注入あり・なしで組み立てられるリクエストと
  解釈後の戻り値が一致することを確認する。注入なし側は実サーバを要するため、
  検証範囲を「注入ありの経路が既定経路と同じ構築処理を通る」ことに限る選択肢もある

### TS-04: `specifications-error-handling.md` R-004（使えない成功応答）

- Original: HTTP 応答ステータスは成功だが、応答本文からアシスタントの発話テキストを取得できない
- Issue: 「取得できない」に該当する条件が列挙されていない。§5 Edge Cases には
  「`choices` が空」「メッセージ内容がテキストでない」の 2 行があるが、規則本文と
  Edge Cases のどちらが網羅の正なのかが読めず、境界のテストを設計できない
- Suggested revision: 該当条件を規則本文に列挙する
  （harden レビューの DR-15 が `finish_reason` の追加を確定済み。適用は `/deckrd spec` の担当）
- Verification method: 条件ごとに応答を注入し、いずれも `ExitFailure` として throw されることを検証する

### TS-05: `specifications-config-packaging.md` R-004（配布ミラーの同期）

- Original: `skills/setup-chatlogs/assets` 配下の複製へ同期し、内容ベースの差分検査が
  差分なしで成功する状態を維持する
- Issue: 「内容ベースの差分検査」の実施手段が spec 本文から辿れない。要件側の AC-012 は
  `bash scripts/sync-skill-assets.sh --check-staged` を名指ししているが、
  spec 単体を読む実装者には検証コマンドが分からない
- Suggested revision: 検査手段を AC-012 への参照として示す
- Verification method: AC-012 が指定するコマンドを実行し、差分なしで終了することを確認する

## 4. Structure Normalization

Formatting and organization improvements.

### S-01: `specifications-error-handling.md` §2.5 に `Status Values` の凡例がない

- Location: `specifications-error-handling.md` §2.5 Behavioral Design Decisions
- Issue: 他 3 ファイルは DD 表の直後に `**Status Values:**`（`Active` / `Promoted → DR-xx` の凡例）を
  置いているが、本ファイルのみ欠けている。DD-01 〜 DD-03 の Status 欄は `Active` を持つため、
  凡例がないと `Promoted → DR-xx` という値の存在が読み取れない
- Fix: 他 3 ファイルと同じ凡例ブロックを §2.5 の DD 表と §2.6 の間に置く

### S-02: `specifications-error-handling.md` の §2.1.1 のみ節番号が 3 階層

- Location: `specifications-error-handling.md` `### 2.1.1 fail-first の射程`
- Issue: 5 ファイル中この 1 箇所だけが 3 階層の節番号を持ち、しかも見出しレベルは
  `###`（`### 2.1` と同じ）で、番号の深さと見出しレベルが対応していない
- Fix: `### 2.2` 以降を繰り下げて独立した節にするか、`#### 2.1.1` として
  見出しレベルを番号の深さに合わせる。index §4 の「Phase 4 で反映した論点」表が
  `Section 2.1.1` を参照しているため、番号を変える場合は index 側も更新する

### S-03: §4 Decision Rules の構成が 3 通りに分かれている

- Location: 4 ファイルの §4
- Issue: transport は「順序付き規則表 + §4.1 結合順序 + §4.2 横断規則」、
  structured-output は「順序付き規則表 + §4.1 分岐 + §4.2 合格基準」、
  error-handling は「§4.1 / §4.2 / §4.3 に規則表を分割（§4 直下に表を持たない）」、
  config-packaging は「順序付き規則表のみ」という 3 通りの構成になっている
- Fix: 意味を変えずに揃えるなら、error-handling も §4 直下に全規則の順序付き表を置き、
  §4.1 以降は補足に回す。ただし §4.1（応答解釈）と §4.2（受理判定）は
  評価順序が独立しているため、1 表に統合すると「順序に従う」という記述が
  成立しなくなる。統合せず現状を是とする判断も採りうる

### S-04: index §4 で番号 `2` が 2 つの別項目を指す

- Location: `specifications-index.md` §4 Open Questions
- Issue: 未決の表に `#2`（shebang 行）があり、直後の解決済みの表にも `旧 #2`
  （`--allow-net` の範囲）がある。列名で区別されてはいるが、本文中で「#2」と参照した場合に
  どちらを指すかが定まらない
- Fix: 解決済みの表の見出しを `旧 #` から `旧番号` へ改めるか、未決側を連番で振り直す

## 5. Cross-Reference Validation

Invalid or missing references.

### CR-01: §6 Requirements Traceability が 4 ファイルとも要件 v1.5.0 に追いついていない

- Location: 4 ファイルの §6 Requirements Traceability
- Reference: 各表は「自ファイルが所有する REQ」と「他ファイルで扱う REQ」を列挙し、
  全 FR を網羅する構成になっている
- Issue: 要件 v1.3.0 で追加された REQ-F-017 / REQ-F-018 / REQ-F-019 と、v1.5.0 で
  受け皿ができた REQ-NF-003 が、表から欠落している。実測した欠落は次のとおり。

  | File              | 欠落している REQ                               |
  | ----------------- | ---------------------------------------------- |
  | transport         | REQ-F-018                                      |
  | structured-output | REQ-F-017 / REQ-F-019 / REQ-NF-003             |
  | error-handling    | REQ-F-017 / REQ-F-018 / REQ-F-019 / REQ-NF-003 |
  | config-packaging  | REQ-F-017 / REQ-F-018 / REQ-F-019 / REQ-NF-003 |

- Fix: 各表に不足行を `Covered in: <ファイル名>` として追加する。
  網羅の基準は index §3 Requirements Coverage（全 19 FR）と、
  index §3 が本文で所在を示す REQ-NF-003 に置く

### CR-02: §2.6 Related Decision Records に DR-14 〜 DR-17 が未反映

- Location: 4 ファイルの §2.6 Related Decision Records
- Reference: 現在の掲載状況は transport（DR-01 / 02 / 05 / 09 / 10 / 12）、
  structured-output（DR-04 / 06 / 09 / 11）、error-handling（DR-03 / 06）、
  config-packaging（DR-02 / 05 / 13）
- Issue: harden レビューで採択され `decision-records.md` v2.4.0 に記録された
  DR-14 〜 DR-17 が、影響先ファイルの §2.6 に現れていない。
  §2.6 は「DR は `decision-records.md` で維持され authoritative」と宣言しているため、
  上流に存在する DR が下流の一覧に無い状態は参照の欠落にあたる
- Fix: 影響先へ追加する。DR-14 → transport、DR-15 → transport / structured-output /
  error-handling、DR-16 → error-handling、DR-17 → transport。
  本監査は掲載の欠落のみを指摘し、DR の内容を spec 規則へ反映する作業は `/deckrd spec` に委ねる

### CR-03: index §4 未決 #2 が config-packaging の記述と矛盾している

- Location: `specifications-index.md` §4 Open Questions #2 /
  `specifications-config-packaging.md` §4 impl-note・§5 Edge Cases
- Reference: index は「要件 REQ-F-010 の対象表が、AI を直接呼ぶエントリスクリプト 3 本の
  shebang 行を挙げていない」を **未決** として掲げている
- Issue: config-packaging は §4 impl-note で「判定対象は…shebang 行も含む」と述べ、
  §5 Edge Cases に「AI を呼ぶエントリスクリプトの shebang 行にネットワーク権限フラグが
  欠けている → 不適合と判定する」を規範として持つ。spec 側では決着している論点が
  索引では未決に見える
- Fix: index の未決 #2 を、spec 内部の未決ではなく **要件への差し戻し事項** として書き直すか、
  解決済みの表へ移して要件側の課題である旨を注記する。
  なお config-packaging §4 の記述が impl-note（非規範）に置かれている点は
  harden レビューの P-03 が扱っており、本監査の射程外とする

### CR-04: index §2 の FR Coverage 表が REQ-NF-003 の所在を示していない

- Location: `specifications-index.md` §2 Specification Files 表
- Reference: transport 行の FR Coverage は
  REQ-F-001 / 002 / 007 / 012 / 015 / 017 / 019
- Issue: index §3 の本文は「REQ-NF-003 は `specifications-transport.md` R-008 が
  検証可能な規則として所有する」と述べており、§2 の表だけがこれを持たない。
  列名が「FR Coverage」であるため NF を含めない読みも成り立つが、
  §2 の Area 欄は transport の担当領域を列挙しており、文字符号化への言及がない
- Fix: §2 の transport 行の Area 欄に文字符号化の担当を 1 語加えるか、
  列名を `REQ Coverage` に改めて REQ-NF-003 を含める

## 6. Typo & Grammar Fixes

| Location | Original | Corrected |
| -------- | -------- | --------- |
| —        | —        | —         |

検出なし。助詞の重複・句読点の重複・全角半角の混在・語の重複のいずれも走査で検出されなかった。
直近の追随作業で修正済みの 2 件（structured-output §2.1「llama バックエインド」→「llama バックエンド」、
error-handling §2.1「この区別自体は既存の / 既存のレートリミット判定」の重複除去）は本表に再掲しない。

## 7. Review Metadata

- Reviewer: AI (deckrd review --phase fix)
- Review Phase: fix
- Review Date: 2026-09-02
- Document Version Reviewed:
  - `specifications-index.md` v1.1.2
  - `specifications-transport.md` v1.2.0
  - `specifications-structured-output.md` v1.2.0
  - `specifications-error-handling.md` v1.0.3
  - `specifications-config-packaging.md` v1.1.2
- Upstream: requirements.md v1.5.0 / decision-records.md v2.4.0
- Input: `reviews-claude-spec-explore-2026-09-02.md` / `reviews-claude-spec-harden-2026-09-02.md`
