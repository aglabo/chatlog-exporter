// src: scripts/testing/mutation/generate-mutants.ts
// @(#): ソース文字列から変異体 (Mutant) の一覧を生成する
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// types
import type { Mutant, MutationOp } from './types/mutation.types.ts';

/** 字句 1 個分の置換規則。 */
type _Replacement = { op: MutationOp; after: string };

/**
 * 字句を切り出す正規表現。
 *
 * 識別子・数値を 1 字句として先に取り、識別子内の `true` や数字を拾わないようにする。
 * 演算子は長いものから並べ、`!==` の `!` や `>>` の `>` を単独の字句にしない。
 */
const _TOKEN_PATTERN = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|>>>=?|>>=?|<<=?|=>|===|!==|!=|==|&&|\|\||\?\?|<=|>=|<|>|\S/g;

/** 識別子を構成する文字。直後に空白なしで `<` が続けばジェネリクスの開きとみなす。 */
const _IDENTIFIER_CHAR_PATTERN = /[\w$]/;

/** import 文の行 (先頭の `import` キーワード)。行内の候補ごと対象外にする。 */
const _IMPORT_LINE_PATTERN = /^\s*import\b/;

/** ジェネリクスの閉じになりうる字句 (`>` の連なり)。 */
const _GENERIC_CLOSE_PATTERN = /^>+$/;

/** 直前 (空白を除く) がこの文字で終わる `!` は、単項否定ではなく後置の非 null 表明 / 確定代入表明とみなす。 */
const _POSTFIX_BANG_PRECEDER_PATTERN = /[\w$)\]]$/;

/** 直前がこのキーワードで終わる `!` は、識別子文字の後でも単項否定とみなす (`return !ok` 等)。 */
const _UNARY_KEYWORD_PATTERN = /\b(?:return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new)$/;

/** 10 進の数値リテラル (整数部 + 任意の小数部)。 */
const _NUMBER_PATTERN = /^(\d+)(\.\d+)?$/;

/** 字句 → 置換規則の表。 */
const _REPLACEMENTS: ReadonlyMap<string, _Replacement> = new Map([
  ['<', { op: 'relational', after: '<=' }],
  ['<=', { op: 'relational', after: '<' }],
  ['>', { op: 'relational', after: '>=' }],
  ['>=', { op: 'relational', after: '>' }],
  ['===', { op: 'equality', after: '!==' }],
  ['!==', { op: 'equality', after: '===' }],
  ['&&', { op: 'logical', after: '||' }],
  ['||', { op: 'logical', after: '&&' }],
  ['??', { op: 'logical', after: '||' }],
  ['true', { op: 'boolean', after: 'false' }],
  ['false', { op: 'boolean', after: 'true' }],
  ['!', { op: 'negation', after: '' }],
]);

/**
 * 数値リテラルを n+1 にした文字列を返す。数値リテラルでなければ `undefined`。
 *
 * 整数部だけを `BigInt` で加算し、小数部は元の表記を残す (浮動小数点の丸めを避ける)。
 */
const _incrementNumber = (token: string): string | undefined => {
  const _match = _NUMBER_PATTERN.exec(token);
  return _match ? `${BigInt(_match[1]) + 1n}${_match[2] ?? ''}` : undefined;
};

/** 字句に対応する置換規則を返す。対象外なら `undefined`。 */
const _replacementOf = (token: string): _Replacement | undefined => {
  const _number = _incrementNumber(token);
  return _number === undefined ? _REPLACEMENTS.get(token) : { op: 'number', after: _number };
};

/**
 * テンプレートリテラルの入れ子 1 段。
 *
 * - `template`: バッククォート内のテキスト部
 * - `expr`: `${ ... }` 内のコード部。`depth` は `${` 以降に開いた `{` の数
 */
type _Frame = { kind: 'template' } | { kind: 'expr'; depth: number };

/** 行をまたいで引き継ぐ字句走査の状態。 */
type _ScanState = { inBlock: boolean; frames: _Frame[] };

/** 引用符ごとの文字列リテラル (エスケープ込み、閉じ引用符が無ければ行末まで)。 */
const _QUOTED_PATTERNS: ReadonlyMap<string, RegExp> = new Map([
  ["'", /^'(?:\\.|[^'\\])*'?/],
  ['"', /^"(?:\\.|[^"\\])*"?/],
]);

/**
 * 正規表現リテラル (文字クラス・エスケープ込み、フラグ付き)。
 * 閉じ `/` が無ければ行末までを正規表現とみなす。
 */
const _REGEX_LITERAL_PATTERN = /^\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\[])*(?:\/[A-Za-z]*)?/;

/** 直前がこの記号・キーワードで終わる (または行頭の) `/` は、除算ではなく正規表現の開始とみなす。 */
const _REGEX_PRECEDER_PATTERN =
  /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new))$/;

/** 1 行の走査中だけ使う状態。`code` はここまでのコード部 (コード以外は空白)。 */
type _LineCtx = _ScanState & { code: string; hasRegex: boolean };

/** 走査位置から消費した文字数と、その文字列をコードとして残すか。 */
type _Consumed = { len: number; keep: boolean };

/** 1 行の走査結果。`code` はコード以外の文字を空白に置き換えた (桁位置を保つ) 行。 */
type _LineScan = { code: string; hasRegex: boolean; state: _ScanState };

/** ブロックコメント内の 1 歩。`*\/` で閉じる。 */
const _scanBlock = (line: string, i: number, ctx: _ScanState): _Consumed => {
  if (!line.startsWith('*/', i)) { return { len: 1, keep: false }; }
  ctx.inBlock = false;
  return { len: 2, keep: false };
};

/** テンプレートのテキスト部の 1 歩。閉じバッククォートと `${` を検出する。 */
const _scanTemplate = (line: string, i: number, ctx: _ScanState): _Consumed => {
  if (line[i] === '\\') { return { len: 2, keep: false }; }
  if (line[i] === '`') {
    ctx.frames.pop();
    return { len: 1, keep: false };
  }
  if (!line.startsWith('${', i)) { return { len: 1, keep: false }; }
  ctx.frames.push({ kind: 'expr', depth: 0 });
  return { len: 2, keep: false };
};

/** コード部の `{` `}` を数え、`${ ... }` の閉じでテンプレートのテキスト部へ戻す。 */
const _scanBrace = (ch: string, ctx: _ScanState): _Consumed => {
  const _top = ctx.frames.at(-1);
  if (_top?.kind !== 'expr') { return { len: 1, keep: true }; }
  if (ch === '{') { _top.depth++; }
  if (ch !== '}') { return { len: 1, keep: true }; }
  if (_top.depth > 0) {
    _top.depth--;
    return { len: 1, keep: true };
  }
  ctx.frames.pop();
  return { len: 1, keep: false };
};

/** コード部の 1 歩。コメント・文字列・テンプレートの開始を検出する。 */
const _scanCode = (line: string, i: number, ctx: _LineCtx): _Consumed => {
  const _quoted = _QUOTED_PATTERNS.get(line[i])?.exec(line.slice(i));
  if (_quoted) { return { len: _quoted[0].length, keep: false }; }
  if (line.startsWith('//', i)) { return { len: line.length - i, keep: false }; }
  if (line.startsWith('/*', i)) {
    ctx.inBlock = true;
    return { len: 2, keep: false };
  }
  if (line[i] === '/' && _REGEX_PRECEDER_PATTERN.test(ctx.code.trimEnd())) {
    ctx.hasRegex = true;
    return { len: _REGEX_LITERAL_PATTERN.exec(line.slice(i))?.[0].length ?? 1, keep: false };
  }
  if (line[i] !== '`') { return _scanBrace(line[i], ctx); }
  ctx.frames.push({ kind: 'template' });
  return { len: 1, keep: false };
};

/** 現在の状態に応じた 1 歩を進める。 */
const _scanStep = (line: string, i: number, ctx: _LineCtx): _Consumed => {
  if (ctx.inBlock) { return _scanBlock(line, i, ctx); }
  return ctx.frames.at(-1)?.kind === 'template' ? _scanTemplate(line, i, ctx) : _scanCode(line, i, ctx);
};

/** 1 行を走査し、コード以外を空白に置き換えた行と次行への状態を返す。 */
const _scanLine = (line: string, state: _ScanState): _LineScan => {
  const _ctx: _LineCtx = {
    inBlock: state.inBlock,
    frames: state.frames.map((frame) => ({ ...frame })),
    code: '',
    hasRegex: false,
  };
  let i = 0;
  while (i < line.length) {
    const _step = _scanStep(line, i, _ctx);
    const len = Math.min(_step.len, line.length - i);
    _ctx.code += _step.keep ? line.slice(i, i + len) : ' '.repeat(len);
    i += len;
  }
  return { code: _ctx.code, hasRegex: _ctx.hasRegex, state: { inBlock: _ctx.inBlock, frames: _ctx.frames } };
};

/**
 * ジェネリクスとして読み飛ばす字句なら、読み飛ばした後の入れ子の深さを返す。対象外なら `undefined`。
 *
 * 識別子の直後に空白なしで続く `<` を開き、開いている間の `>` / `>>` / `>>>` を `>` の個数分だけ閉じる。
 */
const _genericDepthAfter = (token: string, prevChar: string, depth: number): number | undefined => {
  if (token === '<' && _IDENTIFIER_CHAR_PATTERN.test(prevChar)) { return depth + 1; }
  return depth > 0 && _GENERIC_CLOSE_PATTERN.test(token) ? Math.max(0, depth - token.length) : undefined;
};

/** 行をまたいで持ち越す、Mutant 生成側の状態と結果。`depth` はジェネリクスの入れ子の深さ。 */
type _LineMutants = { depth: number; mutants: Mutant[] };

/** 後置の `!` (非 null 表明 / 確定代入表明) なら `true`。`before` はその `!` より前のコード部。 */
const _isPostfixBang = (token: string, before: string): boolean => {
  if (token !== '!') { return false; }
  const _preceding = before.trimEnd();
  return _POSTFIX_BANG_PRECEDER_PATTERN.test(_preceding) && !_UNARY_KEYWORD_PATTERN.test(_preceding);
};

/**
 * コード部 1 行分の Mutant を生成する。
 *
 * ジェネリクスの深さ `depth` は前行から受け取り、行末の深さを返して次行へ持ち越す。
 */
const _lineMutants = (code: string, lineText: string, line: number, file: string, depth: number): _LineMutants =>
  [...code.matchAll(_TOKEN_PATTERN)].reduce<_LineMutants>((acc, match) => {
    const _depth = _genericDepthAfter(match[0], code[match.index - 1] ?? '', acc.depth);
    if (_depth !== undefined) { return { depth: _depth, mutants: acc.mutants }; }
    if (acc.depth > 0 || _isPostfixBang(match[0], code.slice(0, match.index))) { return acc; }
    const _rule = _replacementOf(match[0]);
    if (!_rule) { return acc; }
    const _mutant = {
      file,
      line,
      column: match.index + 1,
      op: _rule.op,
      before: match[0],
      after: _rule.after,
      lineText,
    };
    return { depth: acc.depth, mutants: [...acc.mutants, _mutant] };
  }, { depth, mutants: [] });

/**
 * ソース文字列を字句走査し、変異体 (Mutant) の一覧を返す。ファイル I/O は行わない純粋関数。
 *
 * 置換規則:
 * - relational: `<`↔`<=`、`>`↔`>=`
 * - equality: `===`↔`!==` (`!=` / `==` は対象外)
 * - logical: `&&`↔`||`、`??`→`||`
 * - boolean: `true`↔`false` (識別子の一部は対象外)
 * - number: 10 進の整数・小数を n+1 (識別子の一部は対象外)
 * - negation: 単項 `!` を除去。直前 (空白を除く) が識別子文字・`)`・`]` の `!` は後置の
 *   非 null 表明 / 確定代入表明 (`x!`・`f()!`・`a[0]!`・`let y!: T`) とみなして対象外。
 *   ただし直前が `return` / `typeof` 等のキーワードなら単項否定として扱う
 *
 * 対象外にする範囲:
 * - コメント (`//`、`/* *\/`。ブロックコメントは行をまたいで引き継ぐ)
 * - 文字列リテラル (`'...'` / `"..."`、エスケープ込み) とテンプレートリテラルのテキスト部
 *   (行をまたいで引き継ぐ。`${ ... }` 内はコードとして扱う)
 * - アロー `=>`、シフト `<<` `>>` `>>>` の `<` `>`
 * - **正規表現リテラルを含む行は、正規表現外の候補も含めて行ごと対象外。**
 *   `/` の直前 (空白を除く) が行頭・演算子記号・開き括弧・`return` 等のキーワードなら正規表現の開始、
 *   それ以外 (識別子・数値・閉じ括弧の後) は除算とみなす
 * - **型位置のジェネリクス。** 識別子の直後に空白なしで続く `<` をジェネリクスの開きとし、
 *   対応する `>` (`>>` / `>>>` は `>` の個数分) で閉じる。開いている間 (深さ > 0) は型引数の内側の
 *   候補 (リテラル・演算子) もすべて対象外。深さは行をまたいで持ち越す (複数行の型引数に対応)。
 *   このため空白なしの比較 `a<b` もジェネリクスとみなして対象外になり、対応する `>` が現れるまで
 *   後続の候補も対象外になる (既知の制限)
 * - `import` で始まる行 (行内の候補ごと)
 *
 * @param source - 対象ソース (LF / CRLF)
 * @param filePath - Mutant の `file` に記録するパス
 * @returns line 昇順・column 昇順の Mutant 配列
 */
export const generateMutants = (source: string, filePath: string): Mutant[] =>
  source.split(/\r?\n/).reduce<{ state: _ScanState; depth: number; mutants: Mutant[] }>((acc, lineText, index) => {
    const _scan = _scanLine(lineText, acc.state);
    const _found = _lineMutants(_scan.code, lineText, index + 1, filePath, acc.depth);
    const _skipped = _scan.hasRegex || _IMPORT_LINE_PATTERN.test(lineText);
    return {
      state: _scan.state,
      depth: _found.depth,
      mutants: _skipped ? acc.mutants : [...acc.mutants, ..._found.mutants],
    };
  }, { state: { inBlock: false, frames: [] }, depth: 0, mutants: [] }).mutants;
