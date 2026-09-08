# beads ワークフロー規約

## 原則: issue の状態は bd コマンドでのみ動かす

セッション開始からタスク完了まで、beads を通す経路は下表に固定する。
`.beads/` 配下のファイルを直接書き換えて状態を変えることはしない。

| 場面           | 使うコマンド                | 備考                                           |
| -------------- | --------------------------- | ---------------------------------------------- |
| セッション開始 | `bd prime`                  | `SessionStart` / `PreCompact` フックが自動実行 |
| タスク選択     | `bd ready` → `bd show <id>` | 着手可能な issue を確認して選ぶ                |
| 着手           | `bd update <id> --claim`    | 担当を明示してから作業に入る                   |
| 作業中         | `bd note <id> <本文>`       | 進捗・判断・検証結果をその都度残す             |
| 新規作業の発生 | `bd create --parent <id>`   | 親は必須（[beads-issue.md](beads-issue.md)）   |
| 完了           | `bd close <id>`             |                                                |

タスク管理に TodoWrite・TaskCreate・markdown の TODO リストは使わない。
記録先は beads に一本化する。

## 原則: `.beads/` は bd の管理領域

`.beads/` 配下で人間が編集してよいのは次の 3 つだけ。

| ファイル             | 扱い                                       |
| -------------------- | ------------------------------------------ |
| `.beads/config.yaml` | 人間が編集する（prefix・actor・sync 先）   |
| `.beads/README.md`   | 人間が編集する                             |
| `.beads/.gitignore`  | 人間が編集する（否定パターンは追加しない） |

それ以外はすべて bd の生成物であり、**Write / Edit で直接触らない。**
`issues.jsonl` は embedded Dolt DB のエクスポートで、DB が正。手で編集しても
次の `bd export` / flush で上書きされて失われる。`metadata.json`・
`embeddeddolt/`・`interactions.jsonl`・`export-state.json`・`backup/` も同様。

## 理由

2026-09-08 時点で `.beads/issues.jsonl` は最終コミット `8a5e71319` から stale に
なっており、`bd show --json` が返す `external_ref` が git 管理下の JSONL に 1 件も
乗っていなかった（`cle-znk` / gh-453）。DB とエクスポートの乖離は、JSONL を真実と
みなして手で直すと悪化する。エクスポートを直しても DB は変わらず、次の flush で
編集は消え、消えたこと自体が検知されないまま次の突合作業を生む。

`bd note` を使わずチャット上だけで判断を残す場合も同じで、`/compact` や
セッション終了で失われ、`bd prime` が復元できるのは beads に書いた分だけになる。

## 機械チェック

| フック                                | イベント / matcher           | 止めるもの                                     |
| ------------------------------------- | ---------------------------- | ---------------------------------------------- |
| `.claude/hooks/check-beads-parent.sh` | `PreToolUse` / `Bash`        | 親の無い `bd create` / `bd new`                |
| `.claude/hooks/check-beads-write.sh`  | `PreToolUse` / `Write\|Edit` | bd 管理下の `.beads/` ファイルへの直接書き込み |

`check-beads-write.sh` の素通し条件は、許可 3 ファイルへの完全一致
（`backup/config.yaml` のような同名の生成物は止める）と、`file_path` が取れない
場合の fail-open。意図的に bd 管理ファイルを書き換えるときだけ、環境変数
`BEADS_ALLOW_WRITE=1` を設定した状態で Claude Code を起動し直す。

どちらのフックも Claude Code のツール経由しか見ない。素の端末・他エージェント
からの操作は通らないため、**ルール本体が正であり、フックは補助**である。

Bash 経由の破壊（`rm .beads/...`、リダイレクト、`sed -i`）は意図的に対象外に
してある。bd 自身のコマンドや git 操作との誤検知を避けるためで、ここは規約で守る。

`check-beads-parent.sh` はコマンド文字列をシェルの引用規則どおりにトークン化するため、
`bash -c "bd create ..."` のように引用符で包んだ形は 1 トークンとして扱われ、検査されない。
これも規約で守る範囲であり、フックで塞がない。

## Common Rationalizations

| 言い訳                                      | 反論                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------- |
| jsonl を直接直した方が速い                  | DB が正。次の export で消える。消えたことにも気づけない               |
| 1 行足すだけなので bd を起動するまでもない  | 1 行の差分こそ export に埋もれる。コマンドの起動コストの方が安い      |
| 進捗はチャットに書いたので `bd note` は不要 | `/compact` で消える。次のセッションが読むのは beads だけ              |
| フックが止めないから触ってよい              | フックは補助。Bash 経由は素通しするが、規約違反であることは変わらない |
