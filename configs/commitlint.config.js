// src: configs/commitlint.config.js
// @(#) : commitlint basic configuration
//
// Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// commit lint common configs
export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      headerPattern: /^(?:(merge)\s+\(#(\d+)\):\s+)?(\w*)(?:\(([^)]*)\))?!?: (.+)$/,
      headerCorrespondence: [
        'merge',
        'pr',
        'type',
        'scope',
        'subject',
      ],
    },
  },
  rules: {
    'type-enum': [2, 'always', [
      // === Default conventional types ===
      'feat', // New feature
      'fix', // Bug fix
      'chore', // Routine task, maintenance
      'docs', // Documentation only
      'test', // Adding or updating tests
      'refactor', // Code change without fixing a bug or adding a feature
      'perf', // Performance improvement
      'ci', // CI/CD related change

      // === Custom additions ===
      'config', // (custom) For configuration changes
      'release', // (custom) For releases
      'merge', // (custom) For merge commits, especially when conflict resolution involved
      'build', // (custom) For build system or external dependencies
      'style', // (custom) Non-functional code style changes (e.g., formatting, linting)
      'deps', // (custom) Updating third-party dependencies (npm/yarn/etc.)
    ]],
    'subject-case': [2, 'never', ['start-case', 'pascal-case']], // etc
    'header-max-length': [2, 'always', 76],
  },
};
