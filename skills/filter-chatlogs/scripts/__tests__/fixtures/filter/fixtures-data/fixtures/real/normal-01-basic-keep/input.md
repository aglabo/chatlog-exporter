---
title: TypeScript の型システムと設計パターン
category: development
---

### User

TypeScript の discriminated union を使った状態管理の設計について教えてください。特に、エラーハンドリングパターンとして Result 型を実装する方法が知りたいです。

### Assistant

TypeScript の discriminated union を使った Result 型は、エラーを型安全に扱う強力なパターンです。以下に実装例を示します。

```typescript
type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return { success: false, error: '0で割ることはできません' };
  }
  return { success: true, value: a / b };
}

const result = divide(10, 2);
if (result.success) {
  console.log(result.value); // TypeScript は value の型を number と推論
} else {
  console.error(result.error); // TypeScript は error の型を string と推論
}
```

このパターンの主な利点は：

1. **型安全性**: コンパイル時にエラー処理の漏れを検出できる
2. **明示性**: 関数のシグネチャだけでエラーが発生しうることがわかる
3. **合成可能性**: 複数の Result を連鎖させることができる

### User

複数の非同期処理を連鎖させる場合はどうすればよいですか？

### Assistant

非同期処理の連鎖には、`flatMap` 相当の操作を定義するか、モナディックなライブラリを使う方法があります。

```typescript
async function fetchUser(id: string): Promise<Result<User, ApiError>> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      return { success: false, error: { code: response.status, message: 'ユーザー取得失敗' } };
    }
    return { success: true, value: await response.json() };
  } catch (e) {
    return { success: false, error: { code: 0, message: String(e) } };
  }
}

async function processUser(userId: string): Promise<Result<ProcessedData, ApiError>> {
  const userResult = await fetchUser(userId);
  if (!userResult.success) { return userResult; }

  const user = userResult.value;
  // ... 処理継続
  return { success: true, value: processedData };
}
```

この設計により、エラーは明示的に伝播し、型システムが処理漏れを防ぎます。実際のプロジェクトでは `neverthrow` や `fp-ts` といったライブラリの活用も検討できます。
