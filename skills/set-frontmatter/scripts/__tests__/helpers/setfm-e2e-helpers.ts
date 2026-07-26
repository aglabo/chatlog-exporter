// src: scripts/__tests__/helpers/setfm-e2e-helpers.ts
// @(#): set-frontmatter E2E テスト共有ヘルパー
//       dics/target/cache tempdir 生成・sequential/rate-limit モックファクトリ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

// ─── Helpers
import { BaseMockCommand } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';
// types
import type { DenoCommandLike } from '../../../../_scripts/__tests__/helpers/deno-command-mock.ts';

export const _enc = new TextEncoder();

/**
 * dics + prompts ディレクトリを作成し、最低限のファイルを配置する。
 * loadDics は dicsDir の末尾 "dics" を "prompts" に置換して promptsDir を決定するため、
 * baseDir/dics の形式でディレクトリを作成する。
 */
export async function _makeDicsDir(): Promise<string> {
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
export async function _makeTargetDir(content?: string): Promise<string> {
  const targetDir = await Deno.makeTempDir();
  const mdContent = content ?? '# テスト\n本文テキスト';
  await Deno.writeTextFile(`${targetDir}/test.md`, mdContent);
  return targetDir;
}

/**
 * 2件の .md ファイルを持つ inputDir を作成する。
 * `written.md` と `target.md` を配置する。
 */
export const _makeTwoFileDir = async (): Promise<string> => {
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${dir}/written.md`, '# written\n本文');
  await Deno.writeTextFile(`${dir}/target.md`, '# target\n本文');
  return dir;
};

/**
 * キャッシュディレクトリを作成し、指定キーに `{ status: 'written' }` の JSON を書き込む。
 * @param basenames - 拡張子なしファイル名（例: `['written']`）
 */
export const _makeCacheDir = async (basenames: string[]): Promise<string> => {
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
export const _makeSequentialMock = (responses: Uint8Array[]): DenoCommandLike => {
  let callCount = 0;
  return class extends BaseMockCommand {
    private readonly _stdout: Uint8Array;
    constructor(_cmd: string, _opts: unknown) {
      super();
      const idx = callCount < responses.length ? callCount : responses.length - 1;
      this._stdout = responses[idx];
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
export const _makeRateLimitMock = (stdout = 'Claude usage limit reached'): DenoCommandLike => {
  return class extends BaseMockCommand {
    protected makeOutput() {
      return Promise.resolve({
        success: false,
        code: 1,
        stdout: _enc.encode(stdout),
        stderr: new Uint8Array(),
      });
    }
  } as unknown as DenoCommandLike;
};
