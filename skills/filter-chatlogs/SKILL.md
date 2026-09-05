---
name: filter-chatlogs
description: >
  エクスポート済みチャットログMarkdownをclaude CLIで一括バッチ判定し、
  再利用価値の低いファイル（DISCARD）を削除する。
  strip サブコマンドでは、AIを使わず本文先頭の定型部（TOPICS ASSIGNMENT RULES 等）を除去する。
  /filter-chatlogs で呼び出す。
  KEEP/DISCARD判定にはclaude CLIを使用するため ANTHROPIC_API_KEY 不要。
argument-hint: "[noise-filter|filter] [agent] [YYYY-MM] [--dry-run] [--single-file] / strip <agent> <YYYY-MM>|<path> [--dry-run] [--recover-orphans]"
allowed-tools: Bash, Glob
---

<!-- cspell:words aplys -->

# filter-chatlogs スキル

エクスポート済みチャットログを claude CLI で品質判定してフィルタリングする。
複数ファイルをチャンク単位 (10 件) でバッチ判定し、低価値ファイルを削除する。

## 前提条件

- `claude` コマンドが PATH に存在すること (Claude Code CLI インストール済み)
- `deno` コマンドが利用可能であること (TypeScript 実行用)

## 引数の処理

`$ARGUMENTS` の先頭トークンでサブコマンドを判定する。

- 先頭トークンが `noise-filter` → noise-filter モード（残りの引数を noise-filter スクリプトに渡す）
- 先頭トークンが `filter` → filter モード（先頭トークンを除いた残りの引数を filter スクリプトに渡す）
- 先頭トークンが `strip` → strip モード（先頭トークンを **除いた** 残りの引数を strip スクリプトに渡す）
- それ以外（サブコマンドなし）→ filter モード（`$ARGUMENTS` 全体を filter スクリプトに渡す）

> 重要: strip モードでは `strip` トークンを必ず除去してから渡す。strip スクリプトの引数スキーマは
> `--recover-orphans` しか定義しておらず、`strip` が残ると第1位置引数として扱われ
> `UnknownPositional` エラーになる。

**filter モードの引数解析** (サブコマンドを除いた残りの引数に適用):

- 引数なし → `chatlogs/originalLogs/<デフォルト agent>/` 全体を処理。
  デフォルト agent は `config.yaml` の `agent` で決まる。
  優先順位は **CLI 引数 > `config.yaml` > 組み込み既定 (`claude`)**。
  既定を変えるには `.config/chatlog-exporter/config.yaml` の `agent:` を編集する
- `agent` (例: `chatgpt`) → 指定 agent の全体
- `agent YYYY-MM` (例: `chatgpt 2026-03`) → 指定 agent・指定月
- `--dry-run` → 削除せず対象ファイルを一覧表示 (判定は行わない。後述の注意を参照)
- `--single-file` → 1 ファイルずつ判定 (chunkSize を 1 に固定)

**noise-filter モードの引数解析** (`noise-filter` トークンを除いた残りの引数に適用):

- 引数なし → `chatlogs/originalLogs/claude/` 全体を処理
- `agent` (例: `chatgpt`) → 指定 agent の全体
- `agent YYYY-MM` (例: `chatgpt 2026-03`) → 指定 agent・指定月
- `path` (例: `chatlogs/originalLogs/claude/2026/2026-04`) → 指定パスをそのまま渡す (agent/period の代わり)
- `--dry-run` → 削除せず、ノイズ候補のパスと判定理由をログ出力。
  **ノイズ候補は `remove` ではなく `skip` に計上される**（後述の注意を参照）

**strip モードの引数解析** (`strip` トークンを除いた残りの引数に適用):

- `agent YYYY-MM`（例: `claude 2026-03`）→ 指定 agent・指定月
- `path`（例: `chatlogs/normalizeLogs/claude/2026/2026-07`）→ 指定パスを対象にする
  - agent/period の代わり。`--input-dir <path>` でも同じ
- `--dry-run` → 書き込み・退避・キャッシュ記録をせず、全件の判定内訳を出力
- `--recover-orphans` → 復帰専用モード（後述）
- `--single-file` は存在しない

位置引数の判定ルール (インデックス固定パターン、**filter / noise-filter モード** に適用):

- パターン A: 1つ目がスラッシュを含むパス → 入力ディレクトリ
- パターン B: 1つ目が既知のエージェント (`claude`, `chatgpt`, `codex`) → AGENT。
  2つ目がある場合は `YYYY-MM` 形式が **必須**
- 上記いずれにも当てはまらない 1つ目の引数 → `UnknownPositional` エラー

> 注意: `YYYY-MM` を単独の位置引数として渡すことはできない (`不明な引数` エラーになる)。
> また、プロジェクト名を3つ目の位置引数として渡すこともできない
> （`InvalidDirectoryFormat` エラーになる）。プロジェクト単位の指定はサポートしていない。

strip モードは入力ディレクトリの指定（パターン A・`--input-dir`）を **受理する** が、
出力ディレクトリの指定は拒否する。strip は対象を直接書き換えるため出力先が意味を持たない。

| 入力                                                         | 結果                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 出力ディレクトリ指定（`--output-dir` または3つ目の位置引数） | `strip は出力ディレクトリの指定を受理しません（<agent> <YYYY-MM> で対象を明示してください）: <path>` |
| 入力ディレクトリなしで年月省略（例: `strip claude`）         | `strip は年月の指定を必須とします（例: claude 2026-03）`                                             |

いずれも終了コード 1 で異常終了する。この検査は列挙・キャッシュ初期化を含む **一切の I/O より前** に
行われるため、拒否された実行は 1 件もファイルを変更しない。

入力ディレクトリを指定した場合、agent / period は対象の解決に使われない
（他スキルと同じく `override` として働く）。したがって年月の省略も受理される。

## ステップ1: スクリプトパスの解決

Glob ツールで `**/filter-chatlogs/SKILL.md` を検索し、そのディレクトリを `SKILL_DIR` として確定する。

```bash
SKILL_DIR         = <SKILL.md が存在するディレクトリの絶対パス>
SCRIPT_PATH       = $SKILL_DIR/scripts/filter-chatlogs.ts
NOISE_FILTER_PATH = $SKILL_DIR/scripts/noise-filter-chatlogs.ts
STRIP_PATH        = $SKILL_DIR/scripts/strip-chatlogs.ts
```

## ステップ2: スクリプト実行

`$ARGUMENTS` の先頭トークンで分岐する。

### noise-filter サブコマンドの場合

先頭トークンが `noise-filter` であれば、残りの引数 `$REST_ARGS` をそのまま渡す。

```bash
deno run --config ./deno.json --allow-read --allow-write "$NOISE_FILTER_PATH" $REST_ARGS
```

> `--config ./deno.json` は **Deno の設定ファイル指定**（Deno 自身の設定ファイル）。カレント
> ディレクトリの `deno.json` は、その配下にないモジュールの bare specifier には適用されない。
> User スコープに導入したスキルがこれに当たる。

引数からオプションを組み立てるルール (`--input` は **追加しない**):

<!-- textlint-disable ja-technical-writing/sentence-length -->

- 引数なし → `deno run --config ./deno.json --allow-read --allow-write "$NOISE_FILTER_PATH"`
- `agent` のみ → `deno run --config ./deno.json --allow-read --allow-write "$NOISE_FILTER_PATH" chatgpt`
- `agent YYYY-MM` → `deno run --config ./deno.json --allow-read --allow-write "$NOISE_FILTER_PATH" chatgpt 2026-03`
- `path` (パス区切り含む) → `deno run --config ./deno.json --allow-read --allow-write "$NOISE_FILTER_PATH" chatlogs/originalLogs/claude/2026/2026-04`
- `--dry-run` を含む → 末尾に `--dry-run` を追加

<!-- textlint-enable ja-technical-writing/sentence-length -->

スクリプトは事前フィルタ (prefilter) を実行したうえで、以下のパターンで即座にノイズ判定し、
該当ファイルを削除する (`--dry-run` 時は削除しない):

- ファイル名パターン (say-ok 等)
- Git 操作ログのみの会話
- スキル呼び出し YAML
- 定型 API プロンプト
- スラッシュコマンドのみ
- システムタグのみ
- 本文が `minCharCount` (既定 1000) 文字未満
- user ターンが 1つのとき assistant 応答が `minAssistantChars` (既定 300) 文字未満

このモードは AI を呼び出さないため `--allow-run` は不要。

### filter サブコマンドまたはサブコマンドなしの場合

先頭トークンが `filter` なら除去し、それ以外 (サブコマンドなし) はそのまま `$ARGS` として使用する。
解決した `SCRIPT_PATH` を使い、Bash で実行する (`--input` は **追加しない**)。
`ChatlogCache` の初期化で `TEMP` 環境変数を参照するため `--allow-env` が必須:

```bash
deno run --config ./deno.json --allow-read --allow-run --allow-write --allow-env "$SCRIPT_PATH" $ARGS
```

引数からオプションを組み立てるルール:

<!-- textlint-disable ja-technical-writing/sentence-length -->

- 引数なし → `deno run ... "$SCRIPT_PATH"`
- `agent` のみ → `deno run ... "$SCRIPT_PATH" chatgpt`
- `agent YYYY-MM` → `deno run ... "$SCRIPT_PATH" chatgpt 2026-03`
- `--dry-run` を含む → 末尾に `--dry-run` を追加
- `--single-file` を含む → 末尾に `--single-file` を追加

<!-- textlint-enable ja-technical-writing/sentence-length -->

スクリプトは次の順で処理する。

1. prefilter (AI なし) — 以下に該当するファイルを AI 呼び出し前に削除する
   - ファイル名パターン / 空の本文 / `minCharCount` (既定 1000) 文字未満の本文
   - user ターンなし / システムタグのみの user メッセージ
   - user ターンが 1つのとき assistant 応答が `minAssistantChars` (既定 300) 文字未満
2. AI 判定 — 残りを claude CLI でチャンク単位にバッチ判定する
   - 判定軸は「技術的か」ではなく「判断の理由 (WHY) が残っているか」
   - KEEP: 決定、およびその根拠 / 却下された案、およびその理由 / 発見された制約・前提 /
     ハマりどころと解法 / ユーザーの確定回答
   - DISCARD: 実行ステータスのみ / 些末な Q&A / 結論が現在のコードから自明 /
     そのセッション内でしか意味を持たない文脈依存の記述
   - DISCARD かつ confidence >= `discardThreshold` (既定 0.7、`config.yaml` で変更可) → 削除対象として記録
   - DISCARD だが confidence が閾値未満 → 判定を保留し、次回実行時に再判定する
3. sweep (削除) — 記録済みの DISCARD ファイルを実際に削除する

> 判定結果は永続キャッシュに保存されるため、再実行時は判定済みファイルの AI 呼び出しがスキップされる。
> 削除は「記録 → 一括削除」の2段階であり、前回実行で DISCARD 判定されたファイルも今回の削除対象になる。

### strip サブコマンドの場合

先頭トークン `strip` を除去した残りを `$STRIP_ARGS` として渡す（`--input` は **追加しない**）。
`ChatlogCache` の初期化で `TEMP` 環境変数を参照するため `--allow-env` が必須。
AI を呼び出さないため `--allow-run` は不要 (noise-filter と同じ):

```bash
deno run --config ./deno.json --allow-read --allow-write --allow-env "$STRIP_PATH" $STRIP_ARGS
```

引数からオプションを組み立てるルール:

- `agent YYYY-MM` →

  ```bash
  deno run --config ./deno.json --allow-read --allow-write --allow-env "$STRIP_PATH" claude 2026-03
  ```

- `path` →

  ```bash
  deno run --config ./deno.json --allow-read --allow-write --allow-env "$STRIP_PATH" chatlogs/normalizeLogs/claude/2026/2026-07
  ```

- `--dry-run` を含む → 末尾に `--dry-run` を追加
- `--recover-orphans` を含む → 末尾に `--recover-orphans` を追加

対象は入力ディレクトリを指定した場合はそのパス、指定しない場合は
`<chatlogsDir>/originalLogs/<agent>/<年>/<YYYY-MM>/`。いずれも **サブディレクトリを含めて再帰的に** 走査する。

スクリプトは次の順で処理する。

1. 受理ゲート — 前述の受理範囲外なら、列挙より前に異常終了する
2. 列挙と孤立退避の検出 — 対象ディレクトリ配下の `.md` を再帰的に列挙する。
   本体 `.md` が存在しないのに `.bak` だけが残っている「孤立退避」を検出し、`error` に計上する

   列挙結果にベース名（拡張子なし）の重複があると、キャッシュのキーが衝突する。
   一方が誤って `done` と判定されるため、重複の検出時点で異常終了する
   （`DuplicateBasename`。1 件もファイルを変更しない）
3. 判定 — 各ファイルを以下の順序で判定する（上から順に評価し、最初に該当した分類で確定する）

   | 順序 | 条件                                                         | 分類          |
   | ---- | ------------------------------------------------------------ | ------------- |
   | 1    | frontmatter を持たない（読み取り失敗を含む）                 | `error`       |
   | 2    | キャッシュに処理済み記録（`stripped` / `passthrough`）がある | `done`        |
   | 3    | 対応する `.bak` が既に存在する                               | `done`        |
   | 4    | 本文に `## Summary` が1つも無い                              | `passthrough` |
   | 5    | 本文先頭〜最初の `## Summary` に定型部マーカーが無い         | `passthrough` |
   | 6    | 除去後の本文が空、または除去率が 99% を超える                | `error`       |
   | 7    | 上記いずれにも該当しない                                     | `stripped`    |

   境界は行頭完全一致（`## Summary` の最初の出現、マーカーは `## TOPICS ASSIGNMENT RULES`）で検出し、
   Markdown 構文解析は行わない

   `passthrough`（順序 4・5）と確定したファイルは、その時点でキャッシュへ記録する
   （`status=passthrough`、`rule` は成立した順序 4 / 5 の規則）。
   記録しないと次回実行が同じファイルを読み直して再判定するため、大量ファイルで毎回のコストになる。
   記録に失敗した場合は当該ファイルを `error` に計上する（本体は無変更）

4. 書き込み — `stripped` のファイルを「`.tmp` へ書き出す → 元を `.bak` へ退避する → `.tmp` を本体名へ移動する」
   の順で置き換える。`status=stripped` のキャッシュ記録は最終移動の成功後に行う
5. 退避の一括削除 — 対象ディレクトリ **配下（サブディレクトリを含む）** の `.bak` を一括削除する。
   実行条件は、`error` 0 件、非 dry-run、かつ strip したパスがすべて退避として存在すること。

   対象サブツリー内の `.bak` はすべて strip の作業対象とみなすため、
   strip 以外の経路で置かれた `.bak` も削除される。削除の前に、当該実行で strip したファイルに
   由来しない `.bak` の件数とパスを警告として報告する（`::warn::` 行の `foreign:`）

   **`stripped` が 0 件でもこの削除は走る**。除去対象が 1 件も無い実行では
   当該実行に由来する退避も存在しないため、サブツリー内のすべての `.bak` が
   `foreign` として削除される。除去対象の有無にかかわらず、対象ツリーに残しておきたい `.bak` を
   置いたまま非 dry-run で実行しないこと

#### 再 export したときの注意

キャッシュはファイル名で引かれ、内容が変わったかどうかは見ない。
そのため同じセッションを再 export して定型部つきの内容を同じパスへ上書きすると、
判定順序 2 で `done` となり定型部が残る。

**運用フロー**: 再 export したら strip キャッシュ（`<cacheDir>/strip-cache/`）を手動で削除してから
strip を再実行する。再 export はログを作り直す操作であり、filter・strip もやり直す前提のため、
キャッシュの破棄はスキルではなく利用者が行う。

#### 別ツリーを `--input-dir` で処理するときの注意

キャッシュのキーはファイル名（拡張子なしのベース名）であり、対象ツリーのパスを含まない。
`strip-cache` は agent / period ごとにも分かれていない。
**異なるツリーに同名のファイルが存在すると、前のツリーで記録した `stripped` / `passthrough` を引いてしまい、
判定順序 2 で `done` になる**。
`--input-dir` で任意のツリーを指定できるようになったため、コピーやエクスポートで作った
別ツリーを処理する場合にこれが起こりうる。

防御は 2 段構えであり、実行をまたぐ衝突は運用で解く。

| 層         | 手段                                            | 守れる範囲                     |
| ---------- | ----------------------------------------------- | ------------------------------ |
| 実行内     | ベース名重複の受理ゲート（`DuplicateBasename`） | 同一実行の列挙内で衝突する場合 |
| 実行またぎ | `<cacheDir>/strip-cache/` の手動削除            | 別ツリー・再 export の場合     |

**運用フロー**: 直前の実行と異なるツリーを `--input-dir` で指定するときは、
strip キャッシュを削除してから実行する。内容ハッシュや mtime による自動無効化は採らない。
判定を省くためのキャッシュに全件の再ハッシュ・stat を課すことになり、6000 件規模で目的と逆行する。

#### 復帰専用モード（`--recover-orphans`）

孤立退避を元のファイル名へ復帰させ、**strip は一切行わずに終了する** モード。

- `.bak` を持つものだけを `.md` へリネームして復帰する（`.tmp` は参照しないため、併存していても残る）
- 復帰したファイルのキャッシュエントリを削除する。削除しないと次回実行が判定順序 2 で `done` と誤判定し、
  定型部が恒久的に残るため
- `--dry-run` と併用した場合は復帰させず、対象件数とパスの報告にとどめる

**運用フロー**: 孤立退避が検出されたら `--recover-orphans` で復帰させ、その後 **フラグ無しで再実行** して strip する。
復帰しただけでは未 strip の状態に戻るだけで、定型部は除去されない。

## dry-run の挙動に関する注意

filter モードの `--dry-run` は、**claude CLI を呼び出さず対象ファイルを一覧表示するだけ**。

- KEEP / DISCARD の判定は行われない (`judged=0`)
- 対象ファイルはすべて `skip` に計上される

判定結果を事前に確認する用途には使えない点に注意する。

noise-filter モードの `--dry-run` は判定を **通常実行と同一の規則で行う**（事前レビューに使える）が、
**カウンタの載り先が通常実行と異なる**。

- ノイズ確定ファイルは `remove` ではなく **`skip`** に計上される
- したがって **dry-run の `remove` は常に 0** である。
  「実行すれば何件消えるか」は `skip` を見る
- 明細行も dry-run では `skipped (<理由>): <name>`、通常実行では `removed (<理由>): <name>` と
  語が入れ替わる。理由と件数は両者で一致する

```bash
# dry-run — skip=70 が削除見込み件数。remove=0 は「消えない」という意味ではない
完了 (dry-run): keep=862 skip=70 remove=0 error=0

# 同じ対象の通常実行 — skip がそのまま remove に移る
完了: keep=862 skip=0 remove=70 error=0
```

**`remove=0` を「削除対象なし」と読んではならない。** dry-run では必ず 0 になる。

strip モードの `--dry-run` は **挙動が逆** であり、filter の注意点をそのまま持ち越してはならない。

- 全ファイルを通常実行と **同一の規則で判定する**（件数・分類とも通常実行と一致する）
- 書き込み・`.bak` 作成・**キャッシュ記録のいずれも行わない**（`passthrough` の記録も行わない）
  （キャッシュに記録すると次回実行が全件 `done` になるため）
- 事前レビューの用途に使える

## ステップ3: 結果通知

スクリプト完了後、`stderr` のサマリー行を読んでユーザーに結果を通知する。

サマリーは `::info::` プレフィックス付きで stderr に出力される。

**filter モードの通知形式**:

```bash
::info:: 完了: total=50 keep=42 skip=3 remove=5 error=0
```

- 上記 5つのカウンタ (total / keep / skip / remove / error) を報告する
- 削除件数は `remove` である (`discarded` というキーは出力されない)
- dry-run モードの場合は `完了 (dry-run): ...` となり、その旨を明示する
- 削除されたファイルのパスは `DISCARD: <path>` として **stdout** に出力される

**noise-filter モードの通知形式**:

```bash
::info:: 完了: keep=1743 skip=0 remove=12 error=0
```

- 上記 4つのカウンタ (keep / skip / remove / error) を報告する (`total` は出力されない)
- dry-run モードの場合は `完了 (dry-run): ...` となり、その旨を明示する。
  **dry-run では `remove=0` になり、削除見込み件数は `skip` に載る**。
  この 2 つを取り違えて「削除対象なし」と報告しないこと（前掲の注意を参照）
- ノイズ判定されたファイルのパスと判定理由を簡潔にまとめる。
  件数が多い場合は理由別に集計して示し、全パスの羅列は避ける

**strip モードの通知形式**:

```bash
::info:: 対象ファイル数: 6398
::info::   stripped: /path/to/originalLogs/2026-03-01-session.md
::info::   passthrough: /path/to/originalLogs/2026-03-02-plain.md
::info:: 完了: total=6398 stripped=6390 skipped=0 done=5 passthrough=3 error=0 bytesBefore=41230118 bytesAfter=12904553
```

- 上記 6つのカウンタ（total / stripped / skipped / done / passthrough / error）を報告する
- あわせて除去前後の合計バイト数（bytesBefore / bytesAfter）を報告する
- カウンタは **`完了:` の行からのみ** 拾う。個別行を数え上げてはならない
- `bytesBefore` / `bytesAfter` は **除去対象と分類されたファイルの本文**（frontmatter を除く）
  UTF-8 バイト数の合計であり、対象ディレクトリ全体のサイズではない。
  除去対象が 1 件も無い実行では両方とも 0 になる（集計ミスではない）
- 通常実行では処理したファイルごとに `<分類>: <path>` の行が出力される。
  分類は `stripped` / `passthrough` の 2 種のみで、`done`（処理済み）と判定 error は出力されない
- **個別行は通知に転記しない**。上の例で `stripped` は 6390 件あり、
  そのまま並べると通知が個別行で埋まる。通知にはカウンタと、
  `error` があればその内容（`::error::` 行）のみを載せる
- dry-run モードの場合は `完了 (dry-run): ...` となり、その旨を明示する。
  **dry-run では `stripped=0` になる**。1 件も書き換えていないためであり、集計ミスではない。
  「実行すれば何件 strip されるか」は `skipped` を見る

  ```bash
  ::info:: 完了 (dry-run): total=6398 stripped=0 skipped=6390 done=5 passthrough=3 error=0 bytesBefore=41230118 bytesAfter=12904553
  ```

  `stripped`（書き換えた実績）と `skipped`（見送った件数）は排他であり、
  通常実行では `skipped=0`、dry-run では `stripped=0` となる

  `bytesBefore` / `bytesAfter` は dry-run でも通常実行と同じ値になる。
  1 件ごとの明細はバイト数を出さないため、実行前に除去規模を知る手段はこの 2 つだけである

  この場合、上記の個別行（`stripped:` / `passthrough:`）は出力されず、代わりに下記の明細行が出る
- dry-run の明細行はパスと判定結果のみを出力する。
  除去対象は `stripped (skip)` と表示され、「実行すれば strip されるが dry-run のため見送った」ことを表す。
  判定理由（`rule=`）は原因の特定を要する `error` のときだけ付く

  ```bash
  ::info:: <<dry-run>> <path>/strip-me.md: outcome=stripped (skip)
  ::info:: <<dry-run>> <path>/plain.md: outcome=passthrough
  ::info:: <<dry-run>> <path>/cached.md: outcome=done
  ::info:: <<dry-run>> <path>/broken.md: outcome=error rule=R-002
  ```

**strip 復帰専用モードの通知形式**:

```bash
::info:: 完了（復帰専用）: recovered=3 skipped=1 error=0
```

- 報告に使うのは `完了（復帰専用）:` の行である。復帰処理そのものも件数行を出力するため、
  行を選ばずに件数を拾うと二重に数えてしまう
- `--dry-run` 併用時は `復帰対象: recovered=N skipped=N 件` の行を報告する
- **`error > 0` のときは報告行を出力した後に終了コード 1 で異常終了する**。
  error には「復帰リネームの失敗」と「復帰後のキャッシュ削除の失敗」の 2 種が含まれる。
  後者は、本体に未 strip・キャッシュが処理済みという乖離を残しており、放置すると次回の strip 実行が
  当該ファイルを永久に `done` と判定して定型部が残り続ける。再度 `--recover-orphans` を実行しても
  復帰済みのファイルは孤立退避ではなくなっており回収できないため、error のパスを個別に対処する

### strip の結果を読むときの注意

- **通常モードでは `error > 0` でも終了コードは 0（正常終了）になる**。この場合は退避（`.bak`）が
  削除されずに保持されている状態であり、対処が必要である。成功扱いのまま放置しない。
  復帰専用モード（`--recover-orphans`）はこれと異なり、`error > 0` で終了コード 1 になる
  （上記「strip 復帰専用モードの通知形式」参照）
- **カウンタの合計は `total` と一致するとは限らない**。`error` には性質の異なる 2 種類が合算される。
  - `.md` 由来の error（frontmatter 無し・除去率超過・書き込み失敗）→ `total` に **含まれる**
  - 孤立退避由来の error → `.md` が無いため `total` に **含まれない**

  したがって成立するのは `stripped + skipped + done + passthrough + (.md 由来の error) == total` であり、
  `total=50 stripped=10 skipped=0 done=39 passthrough=0 error=4` のような行（`.md` 由来 1 件・孤立退避 3 件）は
  矛盾ではない。合計が `total` に満たないことをもって集計ミスと判断しない
- **strip の対象ツリー配下に strip 由来でない `.bak` を置かない**。手動で置いた `important.md.bak` があると、
  対応する `important.md` は判定順序 3 で `done` となる。strip されないまま、当該 `.bak` が一括削除で失われる。
  この実行は `error=0` / 終了コード 0 で完了するため、`::warn::` の `foreign:` 行が唯一の手がかりになる
- 退避の一括削除に失敗した場合は、サマリー行を出力した **後** に終了コード 1 で異常終了する
