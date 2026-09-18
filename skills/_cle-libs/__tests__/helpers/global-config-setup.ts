// src: skills/_cle-libs/__tests__/helpers/global-config-setup.ts
// @(#): GlobalConfig 初期化ユーティリティ
//       テストごとに GlobalConfig を DEFAULT_CONFIG_VALUES で作り直し、テスト後にリセットする
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.

import { afterEach, beforeEach } from '@std/testing/bdd';
import { GlobalConfig } from '../../classes/GlobalConfig.class.ts';

/**
 * GlobalConfig を DEFAULT_CONFIG_VALUES で初期化する beforeEach / afterEach を登録する。
 *
 * ローカルの `.config/chatlog-exporter/config.yaml`（model / llamaEndpoint 等）を読ませないため、
 * 各テスト前に空 YAML でシングルトンを作り直し、テスト後にリセットする。
 * `describe` の先頭で呼ぶこと。
 */
export const useDefaultGlobalConfig = (): void => {
  beforeEach(() => {
    GlobalConfig.resetInstance();
    GlobalConfig.getInstance({ yaml: '' });
  });
  afterEach(() => {
    GlobalConfig.resetInstance();
  });
};
