---
session_id: a4a84394-6140-4668-b1ed-de0b50d8ffb1
date: 2026-03-11
project: aplys
slug: sharded-questing-starfish
---

<!-- markdownlint-disable no-inline-html -->

# API設計レビュー

## 会話ログ

### User

aplys <domain>/<target> <action> [files...]

この設計は良い。

理由

filesystem dispatch と一致

namespace 衝突回避

CLI短い

ここは変更不要。

ただし仕様に 1行追加した方がよい。

domain / target validation
[A-Za-z0-9_-]+

.は禁止。

理由

path traversal 対策。

### Assistant

了解しました。domain/target validation の仕様を追記します。

正規表現 `[A-Za-z0-9_-]+` で `.` を禁止することで、path traversal 攻撃を防ぎます。
