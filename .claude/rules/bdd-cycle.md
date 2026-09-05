# BDD 開発サイクル（chatlog-exporter 固有）

RGR サイクルの適用トリガー・免除条件・フェーズゲート、および `bdd-coder` への委譲ルールは
deckrd の `deckrd-rule-bdd-cycle.md` が正とする
（`.claude/rules/deckrd-rules/deckrd-rules-index.md` 参照）。
本ファイルは chatlog-exporter 固有の差分のみを定める。

テストコードを書くときは `docs/rules/testing-conventions.md` を Read する。

## 委譲後の差分検証

委譲直後に、実際に変更されたファイルを差分で確認する。

```bash
git --no-optional-locks status --short
git --no-optional-locks diff --stat HEAD -- <対象ディレクトリ>
```

`--no-optional-locks` は必須。rtk 経由の `git status` はキャッシュした古い出力を返すことが
あるため、これを付けるか `ls` でファイルを直接確認する。

## 「1 委譲 = 1 タスク」の根拠

2026-08-18 の cle-vyt で、T-01（新規ファイル作成のみ）を委譲したエージェントに
T-01 と T-02 が併記されたチェックリストを渡したところ、プロンプトで「T-01 のみ」と
指示したにもかかわらず T-02 相当まで実装された。さらに最終報告では
「`write-stripped.ts` は触っていない」と申告した。

つまり、**渡す資料に他タスクが載っていれば指示は無視され、自己申告と実差分は食い違う**。
チェックリストを渡す場合は当該タスク分のみを記載したファイルにする。
想定外のファイルが変更されていたら、次を委譲せず、まずユーザーに報告する。
