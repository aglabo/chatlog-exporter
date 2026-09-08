---
title: "Decision Records: libs/config"
module: "libs/config"
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

## Index

| ID    | Decision                                                                         | 主な影響先                                  |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------- |
| DR-01 | 既定の設定ファイル名を定数化し、`configDir` の前置は解決側の 1 箇所に閉じる      | `GlobalConfig.class.ts` / `parse-args.ts`   |
| DR-02 | 相対パスの二重前置を除き、明示指定された設定ファイルの未存在は fail-first とする | `resolve-path.ts` / `GlobalConfig.class.ts` |

---

## DR-01: 既定の設定ファイル名を定数化し、`configDir` の前置は解決側の 1 箇所に閉じる

**Status**: Accepted

**Context**: `GlobalConfig.loadConfigFile` は `resolveConfigPath` へ渡す `defaultPath` を
`` `${this.configDir}/config.yaml` `` と組み立てていました。`resolveConfigPath` は受け取った
相対パスに `configDir` を再度前置するため、解決結果は
`.config/chatlog-exporter/.config/chatlog-exporter/config.yaml` となり実在しません。
既定の設定ファイルが読まれず、コード側の既定値が黙って使われていました。

この不具合を覆い隠していたのがテストです。`T-CLS-GC-87` / `T-CLS-GC-88` は `.endsWith()` で
検証しており、二重前置されたパスも末尾一致を満たすため合格していました。

当初は「6 箇所の `parseArgs` 呼び出しへ `defaultConfigFile` を明示的に渡す」ことも
受入条件に含めていました。

**Decision**:

1. 既定の設定ファイル名を定数 `DEFAULT_CONFIG_FILE = 'config.yaml'` として切り出し、
   `loadConfigFile` は `configDir` を前置せずこの定数を渡す。`configDir` の前置は
   `resolveConfigPath` が唯一の責任者となる
2. 検証は末尾一致ではなく完全一致で行う。`T-CLS-GC-87` / `T-CLS-GC-88` を `assertEquals` に
   改め、修正前の実装では落ちる状態を作ってから直す
3. 6 箇所の `parseArgs` 呼び出しへ `defaultConfigFile` を明示的に渡すことは **行わない**

**Alternatives Considered**:

- `resolveConfigPath` 側で「すでに `configDir` を含むなら前置しない」と判定する —
  DR-02 が別の症状に対してこの方針を採ります。ただし本 DR の時点では、
  既定パスの組み立て側が `configDir` を持ち込んでいること自体が誤りであり、
  解決側の判定で覆うと前置の責任者が 2 箇所に分かれます。まず組み立て側を正す方を採用
- 6 箇所へ明示的に渡す — `parse-args.ts` の引数に
  `defaultConfigFile: string = DEFAULT_CONFIG_FILE` という既定値が付いたため、
  明示渡しは同じ定数を同じ値で渡すだけの no-op になりました。issue 起票時点の前提が
  消滅しており、「最小変更・冗長なコードを書かない」という規約に反するため不採用

**Consequences**: `configDir` の前置箇所が `resolveConfigPath` だけになり、
前置が何回行われるかを 1 箇所で確認できます。回帰は `T-CLS-GC-149` / `T-CLS-GC-150` が
固定します。受入条件のうち「6 箇所への明示渡し」は未実施のまま close しており、
将来 `parseArgs` の既定値を外す場合は本 DR の決定 3 を再検討します。

> 出典: beads `cle-50n`（closed 2026-08-05） / GitHub #400

---

## DR-02: 相対パスの二重前置を除き、明示指定された設定ファイルの未存在は fail-first とする

**Status**: Accepted

**Context**: DR-01 は既定パスの組み立て側を正しましたが、利用者が
`--config .config/chatlog-exporter/config.yaml` のように **`configDir` を含む相対パス** を
明示指定した場合には同じ二重前置が起きます。`resolveConfigPath`
（`skills/_cle-libs/libs/path-utils/resolve-path.ts`）は相対パスを無条件に `configDir` と
結合するためです。

さらに `GlobalConfig.loadConfigFile` は `throwFileNotFound: false` の経路で `{}` を返すため、
解決先が存在しない場合でも、警告とエラーのいずれも出ません。**指定した設定ファイルが読まれていないことに
利用者が気づけません。**

実害が出ています。2026-08-21 の `timeoutMs` 変更作業中、設定値が反映されていないと誤判定しました。
引数なしの `GlobalConfig.getInstance()` では正しく読めるのに、パスを明示すると
コード側既定値の `120000` が返るという、原因を推測しにくい形で現れます。

**Decision**:

1. `resolveConfigPath` は、相対パスがすでに `configDir` 配下を指している場合に
   `configDir` を再度前置しない
2. `configFile` が明示指定されたときは、未存在を握りつぶさず fail-first で throw する。
   `defaultPath` 経由の未存在のみ従来どおり握りつぶす
3. 配布資産（`assets/_cle-libs`）にも同じ変更を同期する

**Alternatives Considered**:

- 決定 1 のみを採る（前置は直すが未存在は握りつぶしたまま） — 二重前置以外の理由で
  解決先が存在しない場合、たとえば単純なパスの打ち間違いが、依然として無言で
  既定値フォールバックになります。今回の誤判定を生んだのは前置そのものではなく
  「読まれていないことが分からない」ことなので、症状の再発を防げません
- 決定 2 のみを採る（未存在を throw するが前置は直さない） — `configDir` を含む相対パスは
  正当な指定であるにもかかわらず常に例外になります。利用者から見れば
  「正しいパスを渡したのにエラー」であり、不具合を別の不具合に置き換えるだけです
- 明示指定時も未存在を警告に留める — `.claude/rules/coding-guidelines.md` の
  fail-first 方針に反します。警告は無視されうるため、設定が効いていない状態のまま
  実行が進む余地を残します

**Consequences**: 明示指定した設定ファイルが読めない場合は実行が止まるため、
設定が効いていない状態で処理が進むことはなくなります。一方で、
存在しないパスを渡していた既存の呼び出しは動作が変わり、例外になります。
`defaultPath` 経由の挙動は変えていないため、引数なしの `getInstance()` は影響を受けません。

> 出典: beads `cle-mc2`（closed 2026-08-20） / GitHub #447

---

## Change History

| Date       | Version | Description                                                                                             |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 / DR-02 を記録（`cle-50n` / `cle-mc2` が出典） |

<!-- markdownlint-enable line-length -->
