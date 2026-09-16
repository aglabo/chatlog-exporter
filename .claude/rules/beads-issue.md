# beads 起票規約

## 原則: すべての beads issue は起票時に親を持つ

親は次のいずれか。**両方無い起票を作らない。**

| 親             | 指定方法                          | 使う場面                            |
| -------------- | --------------------------------- | ----------------------------------- |
| GitHub Issue   | `bd create --external-ref gh-<n>` | 既存の GitHub Issue に対応する作業  |
| 親 beads issue | `bd create --parent <beads-id>`   | 既存 beads issue を分割した子タスク |

どちらも張れない新規ルートは、**先に `gh issue create` で GitHub Issue を立て**、
その番号を `--external-ref` に張ってから beads へ起票する。

子は親の突合先を継承する。`cle-x.1` は親 `cle-x` の `external_ref` を指す
（子ごとに GitHub Issue を立て直さない）。

起票後に判明した場合は `bd update <id> --external-ref gh-<n>` で後付けする。
ただし**空のまま放置しない** — 放置分は後でタイトル類似度による突合が必要になる。

## 理由

2026-09-08 に closed beads issue 200 件を GitHub / deckrd へバックポートした
（`cle-0gv`）。起票時に `external_ref` が無かったため、突合は beads タイトルと
GitHub Issue タイトルの Dice 係数で行うしかなく、Phase 0（台帳生成スクリプト
`scripts/backport/build-ledger.ts` + 人手レビュー）が必要になった。結果として
既存 issue へのコメントは 7 通しか張れず、残り 193 件はモジュール別の集約 issue
13 枚（#438〜#450）へ畳むことになった。

起票時に 1 フラグ渡していれば、この工程はまるごと不要だった。

## 機械チェック

`.claude/hooks/check-beads-parent.sh`（`PreToolUse` / matcher `Bash`）が、親の無い
`bd create` / `bd new` を実行前に止める。素通しするのは `--dry-run` / `--graph` /
`-f`（一括起票）/ `--help`。意図的に親なしで起票するときだけ `BEADS_NO_PARENT=1` を前置する。

Claude Code の Bash ツール経由しか見ないため、素の端末や他エージェントからの起票は
このフックを通らない。ルール本体が正であり、フックは補助。

コマンド文字列はシェルの引用規則どおりにトークン化してから判定する。入力が読めない
とき（`jq` の失敗、`command` キー無し、32KB 超）は作業を止めないよう素通しする。
挙動は `scripts/hooks/__tests__/unit/check-beads-parent.unit.spec.sh` が固定している。

### heredoc の扱い（`cle-znk.4`）

トークナイザは `<<` / `<<-` を認識し、**heredoc の本文はコマンドとして解釈しない。**
そのため本文に `bd create --title x` のような行があってもブロックされない。

```bash
# 通る。note.md を書きたいだけで、起票はしていない
cat > note.md <<'EOF'
bd create --title x
EOF
```

`<<'EOF'` と `<<EOF` は同じデリミタとして扱い、`<<-` はタブ字下げされた終端行を許す。
heredoc として扱う条件は次の 3 点。

- **`<<` / `<<-` の直後にデリミタが続く形だけを heredoc とみなす。** `cat << EOF` のように
  空白を挟む形は heredoc とみなさず、本文を通常のコマンドとして検査する
  （算術の左シフト `$(( x << y ))` を heredoc と誤認しないための意図的な制限。
  回避策は `<<EOF` と空白を詰めること）
- **終端デリミタの行が後方に実在するときだけ heredoc として扱う。** 終端の無い `<<` は
  heredoc とみなさず、通常のトークンとして検査する
- herestring `<<<` は heredoc ではない

**heredoc の終端より後ろの行、および heredoc を伴う行そのものは通常どおり検査する。**

## Common Rationalizations

| 言い訳                                   | 反論                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| 些細なタスクなので GitHub Issue は大げさ | 些細なタスクほど数が増え、後からの突合が効かない               |
| 後で `bd update` すればよい              | 後から埋めた実績が無い。200 件がそうやって溜まった             |
| 親が思いつかないので今は空で起票する     | 親が無いのではなく決めていないだけ。決められないなら起票が早い |
