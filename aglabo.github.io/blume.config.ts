// src: blume.config.ts
// @(#) : blume basic settings
//
// Copyright (c) 2026- atsushifx <http://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { defineConfig } from 'blume';

export default defineConfig({
  title: 'chatlog-exporter',
  description: 'Export & organize AI Agents chatlog.',
  deployment: {
    site: 'https://aglabo.github.io/chatlog-exporter',
    base: '/chatlog-exporter',
  },
});
