---
title: "Decision Records: chatlog/setup"
module: "chatlog/setup"
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

> 本書の 2 件はいずれも「スキルを User スコープ（`~/.claude/skills/`）へ導入できるようにする」
> という同じ要求から派生しています。DR-01 がモジュール解決、DR-02 が展開先を扱います。

## Index

| ID    | Decision                                                                              | 主な影響先                        |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------- |
| DR-01 | スキル本体の import を `jsr:` 完全指定に置き換え、import map に依存しない             | `_cle-libs` ほか実装 / `SKILL.md` |
| DR-02 | `_scripts` の展開先だけをインストールスコープ基準にし、設定と `deno.json` は pwd 基準 | `setup-chatlogs.sh`               |

---

## DR-01: スキル本体の import を `jsr:` 完全指定に置き換え、import map に依存しない

**Status**: Accepted

**Context**: User スコープ（`~/.claude/skills/`）に導入したスキルを実行すると、
`@std/*` のモジュール解決に失敗してスクリプトが起動できません。

原因は Deno の import map の適用範囲です。カレントディレクトリの `deno.json` が持つ import map は、
**その配下にないモジュールの bare specifier には適用されません**。
User スコープに導入したスキルがこれに当たります。

スキル本体は `import { parse as parseYaml } from '@std/yaml';` のように bare specifier を
使っていたため、リポジトリ内から実行したときは解決できるのに、User スコープからは解決できません。

**Decision**:

1. スキル本体（非テスト）の import を `jsr:` 完全指定に置き換える

   ```diff
   -import { parse as parseYaml } from '@std/yaml';
   +import { parse as parseYaml } from 'jsr:@std/yaml@^1.0.12';
   ```

2. バージョンは `deno.json` の import map と一致させる
   （`@std/fs` `^1.0.23` / `@std/path` `^1.0.0` / `@std/yaml` `^1.0.12`）
3. `SKILL.md` の `deno run` には `--config ./deno.json` を付与する。
   これは Deno の設定ファイル指定であり、`GlobalConfig` の `--config FILE` とは別物である旨を注記する
4. テストコードは対象外とする。テストはリポジトリ内から実行されるため import map が効く

**Alternatives Considered**:

- User スコープに `deno.json` を配置する — 利用者のホーム配下に設定ファイルを増やすことになり、
  スキルの導入が「ファイルを置く」だけで完結しなくなります。
  また同じ import map をリポジトリと User スコープの 2 箇所で維持する必要が生じます
- 実行時に `--import-map` を明示的に渡す — `SKILL.md` の全コマンドに引数が増えるうえ、
  スコープごとに渡すパスも変わります。解決規則が呼び出し側の作法へ依存します
- bare specifier のまま User スコープ導入を許さない — 要求そのものを断念する案です。
  `gh skill install` が両スコープに対応している以上、片方で壊れる状態を残すことになります

**Consequences**: import map の有無に関係なくモジュールが解決されるため、
スキルはどのスコープからでも起動できます。バージョンが実装ファイル側に散るため、
更新時は `deno.json` と実装の両方を揃える必要があります。

User スコープ相当（リポジトリ外 cwd・import map なし）で
`deno check --no-config` により全 7 本のエントリスクリプト
（classify / export / filter / noise-filter / strip / normalize / set-frontmatter）が
型検査を通ることを実証済みです。非テスト実装に bare specifier が残っていないことは
`grep -rn "from '@std/" --include=*.ts skills/ | grep -v __tests__` が 0 件であることで確認しています。

> 出典: beads `cle-kw5`（closed 2026-09-07） / GitHub #427。実装は PR #428（`ab239c694`）

---

## DR-02: `_scripts` の展開先だけをインストールスコープ基準にし、設定と `deno.json` は pwd 基準とする

**Status**: Accepted

**Context**: `gh skill install` はスキルを User スコープ（`~/.claude/skills/`）と
プロジェクトスコープ（`<project>/.claude/skills/`）のどちらにも導入できます。

一方 `/setup-chatlogs` の展開先は常にカレントディレクトリ基準に固定されていました
（`setup-chatlogs.sh` の `resolve_target_dir() { pwd; }`）。

このため setup-chatlogs を User スコープに導入すると、共有ライブラリは
`<pwd>/.claude/skills/_scripts` に置かれます。しかし兄弟スキルは `~/.claude/skills/` 配下にいるため、
それらの相対 import（`../../_scripts/...`）が解決先を失います。
**export / filter / classify / normalize / set-frontmatter の相対 import が全滅します。**

**Decision**: `_scripts` の展開先だけをスキルのインストールスコープ基準に切り替える。
`.config/chatlog-exporter/` と `deno.json` は pwd 基準のまま維持する。

**Rationale**: 2 種類の成果物は性質が異なります。`_scripts` は兄弟スキルから
相対パスで参照される **コード** であり、スキル群と同じ場所にいなければ壊れます。
一方 `.config/chatlog-exporter/`（設定・辞書）と `deno.json` は
**プロジェクト固有の設定** であり、作業対象のプロジェクト直下にあるのが正しい配置です。

**Alternatives Considered**:

- すべてをインストールスコープ基準にする — User スコープ導入時、設定と辞書が
  ホーム配下に 1 セットだけ置かれます。プロジェクトごとに異なる分類辞書を持てなくなります
- すべてを pwd 基準のまま（現状維持）とし、User スコープ導入を禁止する —
  `gh skill install` の機能を片方だけ使えない状態にします
- 兄弟スキルの相対 import を絶対パス解決に変える — 相対 import を捨てると、
  スキル群がインストール場所を知る仕組みが別途必要になります。
  DR-01 が `jsr:` 完全指定で外部依存を解決したのに対し、こちらは内部の相対参照であり、
  同じ手段は使えません

**Consequences**: 展開先の基準が成果物の種類によって 2 通りになるため、
`setup-chatlogs.sh` は「どちらの基準を使うか」を成果物ごとに判断します。
この分岐の理由は本 DR が唯一の記録です。

> 出典: beads `cle-kc0.8.4`（closed 2026-08-04） / GitHub #439

---

## Change History

| Date       | Version | Description                                                                                                 |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 1.0.0   | 初版。closed 済み beads issue のバックポートとして DR-01 / DR-02 を記録（`cle-kw5` / `cle-kc0.8.4` が出典） |

<!-- markdownlint-enable line-length -->
