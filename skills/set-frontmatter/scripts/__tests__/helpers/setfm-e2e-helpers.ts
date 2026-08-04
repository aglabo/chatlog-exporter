// src: scripts/__tests__/helpers/setfm-e2e-helpers.ts
// @(#): set-frontmatter E2E テスト共有ヘルパー
//       dics/target/cache tempdir 生成・sequential/rate-limit モックファクトリ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── Helpers
import { BaseMockCommand, wrapClaudeJson } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';
// types
import type { DenoCommandLike } from '../../../../_cle-libs/__tests__/helpers/deno-command-mock.ts';

export const enc = new TextEncoder();

/**
 * dics + prompts ディレクトリを作成し、最低限のファイルを配置する。
 * loadDics は dicsDir の末尾 "dics" を "prompts" に置換して promptsDir を決定するため、
 * baseDir/dics の形式でディレクトリを作成する。
 */
export async function makeDicsDir(): Promise<string> {
  const baseDir = await Deno.makeTempDir();
  const dicsDir = `${baseDir}/dics`;
  const promptsDir = `${baseDir}/prompts`;
  await Deno.mkdir(dicsDir, { recursive: true });
  await Deno.mkdir(promptsDir, { recursive: true });

  // 辞書ファイル（最低限の内容）
  await Deno.writeTextFile(
    `${dicsDir}/types.dic`,
    'research:\n  def: 調査\n  desc: 調査\n  rules:\n    when: []\n    not: []\n',
  );
  await Deno.writeTextFile(
    `${dicsDir}/category.dic`,
    'development:\n  def: 開発\n  desc: 開発\n  rules:\n    when: []\n    not: []\n',
  );
  await Deno.writeTextFile(
    `${dicsDir}/topics.dic`,
    'development:\n  def: 開発\n  desc: 開発\n  rules:\n    when: []\n    not: []\n',
  );
  await Deno.writeTextFile(`${dicsDir}/tags.dic`, '"lang:typescript":\n  def: TypeScript\n');

  // プロンプトファイル
  await Deno.writeTextFile(`${promptsDir}/type.yaml`, 'system: "type ${type_dics}"\nuser: "${entries}"\n');
  await Deno.writeTextFile(
    `${promptsDir}/category.yaml`,
    'system: "category"\nuser: "${category_list} ${focus_guide} ${body}"\n',
  );
  await Deno.writeTextFile(
    `${promptsDir}/meta.yaml`,
    'system: "meta"\nuser: "${log_type} ${log_category} ${topic_list} ${tags_list} ${body}"\n',
  );
  await Deno.writeTextFile(
    `${promptsDir}/review.yaml`,
    'system: "review"\nuser: "${type_dics} ${topic_list} ${category_list} ${tags_list} ${result_type} ${result_category} ${result_yaml}"\n',
  );

  return dicsDir;
}

/** .md ファイルを持つ targetDir を作成する */
export async function makeTargetDir(content?: string): Promise<string> {
  const targetDir = await Deno.makeTempDir();
  const mdContent = content ?? '# テスト\n本文テキスト';
  await Deno.writeTextFile(`${targetDir}/test.md`, mdContent);
  return targetDir;
}

/**
 * 2件の .md ファイルを持つ inputDir を作成する。
 * `written.md` と `target.md` を配置する。
 */
export const makeTwoFileDir = async (): Promise<string> => {
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${dir}/written.md`, '# written\n本文');
  await Deno.writeTextFile(`${dir}/target.md`, '# target\n本文');
  return dir;
};

/**
 * キャッシュディレクトリを作成し、指定キーに `{ status: 'written' }` の JSON を書き込む。
 * @param basenames - 拡張子なしファイル名（例: `['written']`）
 */
export const makeCacheDir = async (basenames: string[]): Promise<string> => {
  const cacheDir = await Deno.makeTempDir();
  const fmCacheDir = `${cacheDir}/fm-cache`;
  await Deno.mkdir(fmCacheDir, { recursive: true });
  await Promise.all(
    basenames.map((name) => Deno.writeTextFile(`${fmCacheDir}/${name}.json`, JSON.stringify({ status: 'written' }))),
  );
  return cacheDir;
};

/**
 * フェーズごとに異なる stdout を返す sequential mock ファクトリ。
 *
 * `responses` の順番に応答し、範囲外のインデックスは最後の応答を返す。
 */
export const makeSequentialMock = (responses: Uint8Array[]): DenoCommandLike => {
  let callCount = 0;
  const _wrapped = responses.map((r) => enc.encode(wrapClaudeJson(new TextDecoder().decode(r))));
  return class extends BaseMockCommand {
    private readonly _stdout: Uint8Array;
    constructor(_cmd: string, _opts: unknown) {
      super();
      const idx = callCount < _wrapped.length ? callCount : _wrapped.length - 1;
      this._stdout = _wrapped[idx];
      callCount++;
    }
    protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array }> {
      return Promise.resolve({ success: true, code: 0, stdout: this._stdout });
    }
  } as unknown as DenoCommandLike;
};

/**
 * rate limit 応答（exit 1 + stdout に "Claude usage limit reached" + stderr 空）を返すモック。
 * runAI の失敗分岐 (_output.success === false) で rate limit パターンにマッチさせ、
 * ChatlogError(AiError/RateLimit) を throw させる。stderr は空 Uint8Array を必ず返す
 * （run-ai.ts が _output.stderr を decode するため欠落すると TypeError になる）。
 *
 * @param stdout - rate limit を示す stdout 文字列（既定: "Claude usage limit reached"）
 * @returns rate limit 応答を返す `DenoCommandLike` モッククラス
 */
export const makeRateLimitMock = (stdout = 'Claude usage limit reached'): DenoCommandLike => {
  return class extends BaseMockCommand {
    protected makeOutput() {
      return Promise.resolve({
        success: false,
        code: 1,
        stdout: enc.encode(stdout),
        stderr: new Uint8Array(),
      });
    }
  } as unknown as DenoCommandLike;
};

/** claude CLI が rate limit で落ちたときの stderr。`runAI` の `_RATE_LIMIT_PATTERN` (`usage limit`) にヒットし RateLimit 判定される。 */
export const RATE_LIMIT_STDERR = 'Claude usage limit reached';

/**
 * 最初の `okCount` 回は指定 stdout で成功し、それ以降は exit 1 + rate limit stderr で失敗するモック。
 *
 * 失敗時 stderr が `runAI` の `_RATE_LIMIT_PATTERN` にヒットするため `RateLimit` に分類される。
 * Phase 2.1（type/category）を成功させてから後続フェーズ（frontmatter / review）で
 * rate limit を発生させ、fatal 伝播でバッチが abort することを検証するために使用する。
 *
 * @param okCount - 成功させる先頭呼び出し回数
 * @param okStdout - 成功時に返す stdout 文字列
 * @returns `DenoCommandLike` モッククラス
 */
export const makeSuccessThenRateLimitFailMock = (okCount: number, okStdout: string): DenoCommandLike => {
  let callCount = 0;
  const _okBytes = enc.encode(wrapClaudeJson(okStdout));
  return class extends BaseMockCommand {
    private readonly _fail: boolean;
    constructor(_cmd: string, _opts: unknown) {
      super();
      this._fail = callCount >= okCount;
      callCount++;
    }
    protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
      if (this._fail) {
        return Promise.resolve({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: enc.encode(RATE_LIMIT_STDERR),
        });
      }
      return Promise.resolve({ success: true, code: 0, stdout: _okBytes, stderr: new Uint8Array() });
    }
  } as unknown as DenoCommandLike;
};

/** claude JSON の非 RateLimit エラー応答（`is_error:true` / `api_error_status:500`）。429 でないため `runAI` は `ExitFailure` に分類する。 */
export const EXIT_FAILURE_JSON = '{"is_error":true,"api_error_status":500,"result":"boom"}';

/**
 * 最初の `okCount` 回は指定 stdout で成功し、それ以降は exit 1 + claude JSON エラー（`is_error:true` /
 * `api_error_status:500`）で失敗するモック。
 *
 * 失敗時 stdout の `api_error_status` が 429 ではないため `runAI` は `RateLimit` ではなく `ExitFailure`
 * （非 RateLimit の AI エラー）に分類する。set-frontmatter の各フェーズで ExitFailure が発生したとき、
 * `main()` が reject せず `logger.error` を出して続行することを検証するために使用する。
 *
 * @param okCount - 成功させる先頭呼び出し回数（type/category: 0 / frontmatter: 1 / review: 2）
 * @param okStdout - 成功時に返す stdout 文字列
 * @returns `DenoCommandLike` モッククラス
 */
export const makeSuccessThenExitFailMock = (okCount: number, okStdout: string): DenoCommandLike => {
  let callCount = 0;
  const _okBytes = enc.encode(wrapClaudeJson(okStdout));
  const _failBytes = enc.encode(EXIT_FAILURE_JSON);
  /** okCount 回成功→以降 ExitFailure JSON を返す `DenoCommandLike` モック。 */
  return class extends BaseMockCommand {
    private readonly _fail: boolean;
    /** 呼び出し回数を数え、okCount 到達後は失敗フラグを立てる。 */
    constructor(_cmd: string, _opts: unknown) {
      super();
      this._fail = callCount >= okCount;
      callCount++;
    }
    /** 失敗時は exit 1 + ExitFailure JSON、成功時は exit 0 + wrapClaudeJson(okStdout) を返す。 */
    protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
      if (this._fail) {
        return Promise.resolve({ success: false, code: 1, stdout: _failBytes, stderr: new Uint8Array() });
      }
      return Promise.resolve({ success: true, code: 0, stdout: _okBytes, stderr: new Uint8Array() });
    }
  } as unknown as DenoCommandLike;
};

/**
 * `failOn`（1始まり）番目の呼び出しだけ exit 1 + rate limit stderr で失敗し、他は success を返すモック。
 *
 * 特定フェーズ 1 箇所だけを rate limit にして、そのフェーズの abort ゲート単体が
 * バッチを止めることを分離検証するために使用する（後続フェーズが救済しない構成）。
 *
 * @param failOn - 失敗させる呼び出し番号（1始まり）
 * @param okStdout - success 時に返す stdout 文字列
 * @returns `DenoCommandLike` モッククラス
 */
export const makeRateLimitFailOnNthMock = (failOn: number, okStdout: string): DenoCommandLike => {
  let callCount = 0;
  const _okBytes = enc.encode(wrapClaudeJson(okStdout));
  return class extends BaseMockCommand {
    private readonly _fail: boolean;
    constructor(_cmd: string, _opts: unknown) {
      super();
      callCount++;
      this._fail = callCount === failOn;
    }
    protected makeOutput(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
      if (this._fail) {
        return Promise.resolve({
          success: false,
          code: 1,
          stdout: new Uint8Array(),
          stderr: enc.encode(RATE_LIMIT_STDERR),
        });
      }
      return Promise.resolve({ success: true, code: 0, stdout: _okBytes, stderr: new Uint8Array() });
    }
  } as unknown as DenoCommandLike;
};
