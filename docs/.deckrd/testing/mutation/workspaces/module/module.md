---
title: mutation
test_scope: MUT
owns:
  - scripts/testing/mutation/**
---

## mutation

変異テストのハーネス。対象ソースに変異（比較演算子・論理演算子・リテラルの置換など）を 1 件ずつ入れ、
既存テストが失敗する（kill）かどうかでテストの検出力を測る。

カバレッジが高くても空振りするテストを見つけるための道具であり、
生き残った変異体（survived）は人が切り分ける前提で扱う。

- GitHub: <https://github.com/aglabo/chatlog-exporter/issues/515>
- beads: `cle-kju.17`（子 T-01〜T-08）

## テスト対象の略語

| 略語 | 対象              |
| ---- | ----------------- |
| `GM` | `generateMutants` |
| `RT` | `resolveTargets` |
| `SM` | `applyMutant` / `toMutantPath` / `toMutationConfigPath` / `buildMutationConfig` |
| `CO` | `stripAnsi` / `parseSummary` / `classifyOutcome` |
| `AL` | `loadAllowlist` / `matchAllowlist` |
| `RP` | `formatReport` / `decideExitCode` |
| `RD` | `runDenoTest` (integration は `RDI`) |
| `RS` | `acquireLock` / `releaseLock` / `sweepArtifacts` / `hashSources` / `detectDrift` / `removeArtifacts` |
| `BL` | `runBaseline` |
| `RM` | `runMutants` |
| `MT` | `parseMutateArgs` / `main` (mutate-tester) |
| `MTI` | `runMutants` integration |
