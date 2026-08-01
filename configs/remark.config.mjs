// src: .remark.config.mjs
// @(#): remark lint common configuration
//
// Copyright (c) 2026 Furukawa Atsushi <atsushifx@gmail.com>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import remarkLintEmphasisMarker from "remark-lint-emphasis-marker";
import remarkLintMaximumLineLength from "remark-lint-maximum-line-length";
import remarkLintNoDuplicateHeadings from "remark-lint-no-duplicate-headings";
import remarkLintNoTabs from "remark-lint-no-tabs";
import remarkLintOrderedListMarkerValue from "remark-lint-ordered-list-marker-value";
import remarkLintStrongMarker from "remark-lint-strong-marker";
import remarkLintTablePipeAlignment from "remark-lint-table-pipe-alignment";

import remarkPresetLintRecommended from "remark-preset-lint-recommended";

const remarkConfig = {
  plugins: [
    remarkPresetLintRecommended,

    remarkLintNoTabs,
    remarkLintNoDuplicateHeadings,
    remarkLintTablePipeAlignment,

    [remarkLintMaximumLineLength, { size: 120, tabWidth: 2 }],
    [remarkLintOrderedListMarkerValue, "ordered"],
    [remarkLintEmphasisMarker, "*"],
    [remarkLintStrongMarker, "*"],
  ],
};

export default remarkConfig;
