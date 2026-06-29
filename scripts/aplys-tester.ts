/**
 * aplys-tester.ts
 * モジュール名（スキル名）によるテスト絞り込みスクリプト
 *
 * 使用方法:
 *   deno task test:module <test-type> [module-name]
 *
 * 例:
 *   deno task test:module all
 *   deno task test:module unit
 *   deno task test:module unit classify
 *   deno task test:module all classify
 */

// ── 定数・テーブル ──────────────────────────────────────────────────────────

export const VALID_TYPES = [
  'unit',
  'functional',
  'integration',
  'e2e',
  'system',
  'fixtures',
] as const;

// --allow-run が必要なテストタイプ
export const TYPES_REQUIRING_RUN = new Set<string>(['integration', 'system', 'fixtures']);

// --allow-env が必要なテストタイプ
export const TYPES_REQUIRING_ENV = new Set<string>(['unit', 'system', 'fixtures']);

// 特殊モジュール: 固有のパス構造を持つ
const _SPECIAL_GLOB_TABLE = {
  'all': '**/__tests__',
  'libs': '**/_scripts/**/__tests__',
  'scripts': 'scripts/**/__tests__',
  'classes': '**/_scripts/classes/**/__tests__',
} as const;

// スキルモジュール: 短縮名 → フルモジュール名
const _SKILL_MODULES = {
  'classify': 'classify-chatlogs',
  'export': 'export-chatlogs',
  'filter': 'filter-chatlogs',
  'normalize': 'normalize-chatlogs',
  'set': 'set-frontmatter',
} as const;

type _SkillAlias = keyof typeof _SKILL_MODULES;
type _SpecialModuleKey = keyof typeof _SPECIAL_GLOB_TABLE;

export const MODULE_GLOB_TABLE: Record<_SpecialModuleKey | _SkillAlias, string> = {
  ..._SPECIAL_GLOB_TABLE,
  ...Object.fromEntries(
    Object.entries(_SKILL_MODULES).map(([alias, full]) => [alias, `**/${full}/**/__tests__`]),
  ),
} as Record<_SpecialModuleKey | _SkillAlias, string>;

// ── 型定義 ─────────────────────────────────────────────────────────────────

export type ValidModule = Exclude<keyof typeof MODULE_GLOB_TABLE, 'all'>;
export type ValidType = typeof VALID_TYPES[number];

export const VALID_MODULES: readonly ValidModule[] = [
  ...(Object.keys(_SPECIAL_GLOB_TABLE).filter((k) => k !== 'all') as ValidModule[]),
  ...(Object.keys(_SKILL_MODULES) as _SkillAlias[]),
];

export type TesterConfig = {
  testType: ValidType | 'all';
  moduleName?: ValidModule | 'all';
  useAi?: boolean;
};

// ── Glob構築 ────────────────────────────────────────────────────────────────

export function buildBaseGlob(moduleName: ValidModule | 'all' | undefined): string {
  return MODULE_GLOB_TABLE[moduleName ?? 'all'];
}

// ── コマンド構築 ────────────────────────────────────────────────────────────

export function buildDenoArgs(targetTypes: ValidType[], baseGlob: string, useAi = false): string[] {
  const paths = targetTypes.flatMap((type) => [
    `${baseGlob}/${type}/**/`,
    `${baseGlob}/*/${type}/**/`,
  ]);
  const needsRun = targetTypes.some((t) => TYPES_REQUIRING_RUN.has(t));
  const needsEnv = useAi || targetTypes.some((t) => TYPES_REQUIRING_ENV.has(t));
  return [
    'test',
    '--parallel',
    '--allow-read',
    '--allow-write',
    ...(needsRun ? ['--allow-run'] : []),
    ...(needsEnv ? ['--allow-env'] : []),
    ...paths,
  ];
}

// ── 設定からコマンド引数構築 ─────────────────────────────────────────────────

export function buildArgsFromConfig(config: TesterConfig): string[] {
  const _targetTypes = config.testType === 'all' ? [...VALID_TYPES] : [config.testType as ValidType];
  const _baseGlob = buildBaseGlob(config.moduleName);
  return buildDenoArgs(_targetTypes, _baseGlob, config.useAi);
}

// ── 環境変数構築 ─────────────────────────────────────────────────────────────

export function buildEnvFromConfig(config: TesterConfig): Record<string, string> {
  return config.useAi ? { RUN_AI: '1' } : {};
}

// ── 引数解析 ────────────────────────────────────────────────────────────────

function printUsage(): void {
  const _types = ['all', ...VALID_TYPES].join('\n  ');
  const _modules = ['all', ...VALID_MODULES].join('\n  ');
  console.error(`\
使用方法: deno task test:module <test-type> [module-name]

テストタイプ (必須、all で全タイプ):
  ${_types}

モジュール名 (省略時または all で全モジュール):
  ${_modules}`);
}

export function parseArgs(args: string[]): TesterConfig {
  const useAi = args.includes('--use-ai');
  const _positional = args.filter((a) => a !== '--use-ai');

  if (_positional.length === 0) {
    throw new Error('テストタイプを指定してください。');
  }

  const testType = _positional[0];
  const rawModule = _positional[1] as string | undefined;

  if (testType !== 'all' && !(VALID_TYPES as readonly string[]).includes(testType)) {
    throw new Error(`不明なテストタイプ "${testType}"`);
  }

  if (rawModule !== undefined && rawModule !== 'all' && !(VALID_MODULES as readonly string[]).includes(rawModule)) {
    throw new Error(`不明なモジュール名 "${rawModule}"`);
  }

  const moduleName = rawModule as ValidModule | 'all' | undefined;
  return { testType: testType as ValidType | 'all', moduleName, useAi };
}

// ── エントリーポイント ───────────────────────────────────────────────────────

export async function main(argv?: string[]): Promise<void> {
  let _config: TesterConfig;
  try {
    _config = parseArgs(argv ?? Deno.args);
  } catch (e) {
    console.error(`エラー: ${(e as Error).message}`);
    printUsage();
    Deno.exit(1);
  }

  const _denoTestArgs = buildArgsFromConfig(_config);
  const _env = buildEnvFromConfig(_config);

  const _command = new Deno.Command(Deno.execPath(), {
    args: _denoTestArgs,
    env: _env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const { code } = await _command.output();
  Deno.exit(code);
}

if (import.meta.main) {
  await main();
}
