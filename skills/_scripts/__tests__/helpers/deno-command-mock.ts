// src: scripts/__tests__/_helpers/deno-command-mock.ts
// @(#): Deno.Command モック用ヘルパー (runAI / segmentChatlog テスト用)
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── 型定義 ────────────────────────────────────────────────────────────────────

/** Deno.Command の最小インターフェイス。テスト用モッククラスが実装する型。 */
export type DenoCommandLike = new(cmd: string, opts: { args: string[]; signal?: AbortSignal }) => {
  spawn(): {
    stdin: { getWriter(): { write(d: Uint8Array): Promise<void>; close(): Promise<void> } };
    output(): Promise<{ success: boolean; code: number; stdout: Uint8Array }>;
  };
  output(): Promise<{ success: boolean; code: number; stdout: Uint8Array }>;
};

// ─── 抽象基底クラス ────────────────────────────────────────────────────────────

/** spawn() 共通骨格と no-op stdin writer を提供する抽象基底クラス。 */
export abstract class BaseMockCommand {
  /** no-op stdin writer を返す。全サブクラスで共有する。 */
  protected static makeStdin() {
    return {
      getWriter() {
        return {
          write(_data: Uint8Array) {
            return Promise.resolve();
          },
          close() {
            return Promise.resolve();
          },
        };
      },
    };
  }

  /** spawn() の共通骨格。makeOutput() をサブクラスで実装する。 */
  spawn() {
    return {
      stdin: BaseMockCommand.makeStdin(),
      output: () => this.makeOutput(),
    };
  }

  /** CommandProvider 向け直接呼び出し用。makeOutput() に委譲する。 */
  output() {
    return this.makeOutput();
  }

  /** サブクラスごとに success/code/stdout を返す抽象メソッド。 */
  protected abstract makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }>;
}

// ─── 具体クラス ────────────────────────────────────────────────────────────────

/**
 * 正常終了(exit 0)を模倣するモッククラス。
 * stdout の内容と constructor に渡された args を検査できる。
 */
export class SuccessMockCommand extends BaseMockCommand {
  private readonly stdout: Uint8Array;
  private readonly capturedArgs?: { value: string[] };

  constructor(
    _cmd: string,
    opts: { args: string[] },
    stdout: Uint8Array,
    capturedArgs?: { value: string[] },
  ) {
    super();
    this.stdout = stdout;
    this.capturedArgs = capturedArgs;
    if (this.capturedArgs) { this.capturedArgs.value = opts.args; }
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return Promise.resolve({ success: true, code: 0, stdout: this.stdout });
  }
}

/** 非ゼロ exit code を模倣するモッククラス。 */
export class FailMockCommand extends BaseMockCommand {
  private readonly code: number;

  constructor(_cmd: string, _opts: unknown, code: number) {
    super();
    this.code = code;
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return Promise.resolve({ success: false, code: this.code, stdout: new Uint8Array() });
  }
}

/** spawn() で Deno.errors.NotFound をスローするモッククラス。 */
export class NotFoundMockCommand extends BaseMockCommand {
  constructor(_cmd: string, _opts: unknown) {
    super();
  }

  override spawn(): never {
    throw new Deno.errors.NotFound('claude');
  }

  override output(): never {
    throw new Deno.errors.NotFound('git');
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    // 到達しない（spawn / output がスローする）
    return Promise.resolve({ success: false, code: 1, stdout: new Uint8Array() });
  }
}

/**
 * `output()` を指定ミリ秒だけ遅延させるモッククラス。
 * `opts.signal` が渡された場合、abort 時に即座に reject する。
 */
export class DelayedSuccessMockCommand extends BaseMockCommand {
  private readonly stdout: Uint8Array;
  private readonly delayMs: number;
  private readonly signal?: AbortSignal;

  constructor(
    _cmd: string,
    opts: { args: string[]; signal?: AbortSignal },
    stdout: Uint8Array,
    delayMs: number,
  ) {
    super();
    this.stdout = stdout;
    this.delayMs = delayMs;
    this.signal = opts.signal;
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({ success: true, code: 0, stdout: this.stdout });
      }, this.delayMs);

      if (this.signal) {
        this.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(this.signal!.reason);
        }, { once: true });
      }
    });
  }
}

/** 呼び出し回数をカウントするモッククラス。 */
export class CountingMockCommand extends BaseMockCommand {
  private readonly responseText: string;

  constructor(_cmd: string, _opts: unknown, responseText: string, counter: { calls: number }) {
    super();
    this.responseText = responseText;
    counter.calls++;
  }

  protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
    return Promise.resolve({
      success: true,
      code: 0,
      stdout: new TextEncoder().encode(this.responseText),
    });
  }
}

// ─── ファクトリヘルパー ────────────────────────────────────────────────────────

/**
 * SuccessMockCommand を DenoCommandLike として返すヘルパー。
 * Deno.Command の置き換えに使用する。
 */
export function makeSuccessMock(
  stdout: Uint8Array,
  capturedArgs?: { value: string[] },
): DenoCommandLike {
  return class extends SuccessMockCommand {
    constructor(cmd: string, opts: { args: string[] }) {
      super(cmd, opts, stdout, capturedArgs);
    }
  };
}

/** FailMockCommand を DenoCommandLike として返すヘルパー。 */
export function makeFailMock(code: number): DenoCommandLike {
  return class extends FailMockCommand {
    constructor(cmd: string, opts: unknown) {
      super(cmd, opts, code);
    }
  } as unknown as DenoCommandLike;
}

/** NotFoundMockCommand を DenoCommandLike として返すヘルパー。 */
export function makeNotFoundMock(): DenoCommandLike {
  return NotFoundMockCommand as unknown as DenoCommandLike;
}

/** CountingMockCommand を DenoCommandLike として返すヘルパー。 */
export function makeCountingMock(responseText: string, counter: { calls: number }): DenoCommandLike {
  return class extends CountingMockCommand {
    constructor(cmd: string, opts: unknown) {
      super(cmd, opts, responseText, counter);
    }
  } as unknown as DenoCommandLike;
}

// ─── Deno.Command 差し替え管理 ────────────────────────────────────────────────

/** installCommandMock が返すハンドル。restore() で元の Deno.Command を復元する。 */
export interface CommandMockHandle {
  restore(): void;
}

/**
 * Deno.Command を指定モックに差し替え、復元ハンドルを返す。
 * beforeEach で呼び出し、afterEach で handle.restore() する。
 *
 * Deno 2.8.0 以降で Deno.Command が getter-only になったため、
 * Object.defineProperty で上書きし、restore 時は元の descriptor を復元する。
 */
export function installCommandMock(mock: DenoCommandLike): CommandMockHandle {
  const descriptor = Object.getOwnPropertyDescriptor(Deno, 'Command')!;
  Object.defineProperty(Deno, 'Command', {
    value: mock,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  return {
    restore() {
      Object.defineProperty(Deno, 'Command', descriptor);
    },
  };
}

/**
 * `output()` を `delayMs` ミリ秒遅延させ、`opts.signal` の abort を受け付けるモックを返す。
 * タイムアウト検証テストで使用する。
 */
export function makeDelayedSuccessMock(delayMs: number, stdout: Uint8Array): DenoCommandLike {
  return class extends DelayedSuccessMockCommand {
    constructor(cmd: string, opts: { args: string[]; signal?: AbortSignal }) {
      super(cmd, opts, stdout, delayMs);
    }
  };
}

/**
 * n 番目の呼び出しだけ失敗させるモックを返す。
 * それ以外の呼び出しは successBytes を返す正常終了モックとして動作する。
 */
export function makeSelectiveFailMock(
  failOnNthCall: number,
  successBytes: Uint8Array,
): DenoCommandLike {
  let callCount = 0;

  return class extends BaseMockCommand {
    private readonly shouldFail: boolean;

    constructor(_cmd: string, _opts: unknown) {
      super();
      callCount++;
      this.shouldFail = callCount === failOnNthCall;
    }

    protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
      if (this.shouldFail) {
        return Promise.resolve({ success: false, code: 1, stdout: new Uint8Array() });
      }
      return Promise.resolve({ success: true, code: 0, stdout: successBytes });
    }
  } as unknown as DenoCommandLike;
}
