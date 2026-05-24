---
title: Deno テストフレームワークの設計
date: 2026-03-15
category: development
---

## Deno テストフレームワークの設計

開発ツールの整備として、Deno ランタイム向けのテスト基盤を整理した。

### テストスタイルの選定

BDD スタイル（describe/it）と TDD スタイル（Deno.test）を比較検討した結果、
`@std/testing` の BDD API を採用することにした。理由は以下の通り:

- テストケースの意図が読みやすい
- `beforeEach` / `afterEach` でセットアップを共有しやすい
- 既存の Jest スタイルのテストと書き方が近い
