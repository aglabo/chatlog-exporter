// src: skills/_cle-libs/__tests__/helpers/logger-stub.ts
// @(#): logger スタブユーティリティ
//       logger オブジェクトの各メソッドをスタブし、出力メッセージを配列でキャプチャする
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import type { Stub } from '@std/testing/mock';
import { stub } from '@std/testing/mock';
import { logger } from '../../libs/io/logger.ts';

/** makeLoggerStub() が返すハンドル。各ログレベルの出力を配列で参照し、restore() でスタブを解除する。 */
export type LoggerStub = {
  logLogs: string[];
  infoLogs: string[];
  warnLogs: string[];
  errorLogs: string[];
  dryrunLogs: string[];
  debugLogs: string[];
  logStub: Stub;
  infoStub: Stub;
  warnStub: Stub;
  errorStub: Stub;
  dryrunStub: Stub;
  debugStub: Stub;
  restore(): void;
};

/**
 * logger.info / logger.warn / logger.error / logger.dryrun / logger.debug をキャプチャするスタブを設置し、ハンドルを返す。
 * afterEach で loggerStub.restore() を呼ぶこと。
 */
export function makeLoggerStub(): LoggerStub {
  const logLogs: string[] = [];
  const infoLogs: string[] = [];
  const warnLogs: string[] = [];
  const errorLogs: string[] = [];
  const dryrunLogs: string[] = [];
  const debugLogs: string[] = [];
  const logStub = stub(logger, 'log', (msg: string) => {
    logLogs.push(msg);
  });
  const infoStub = stub(logger, 'info', (msg: string) => {
    infoLogs.push(msg);
  });
  const warnStub = stub(logger, 'warn', (msg: string) => {
    warnLogs.push(msg);
  });
  const errorStub = stub(logger, 'error', (msg: string) => {
    errorLogs.push(msg);
  });
  const dryrunStub = stub(logger, 'dryrun', (msg: string) => {
    dryrunLogs.push(msg);
  });
  const debugStub = stub(logger, 'debug', (msg: string) => {
    debugLogs.push(msg);
  });
  return {
    logLogs,
    infoLogs,
    warnLogs,
    errorLogs,
    dryrunLogs,
    debugLogs,
    logStub,
    infoStub,
    warnStub,
    errorStub,
    dryrunStub,
    debugStub,
    restore() {
      logStub.restore();
      infoStub.restore();
      warnStub.restore();
      errorStub.restore();
      dryrunStub.restore();
      debugStub.restore();
    },
  };
}
