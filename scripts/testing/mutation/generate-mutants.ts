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
 * 数値リテラル 1 個分 (字句の切り出し用)。
 *
 * - 2/8/16 進: `0x` `0b` `0o` (大文字可) + 桁と `_`、任意の BigInt 接尾辞 `n`
 * - 10 進: `1` `1.` `1.5` `.5` (`_` 区切り可) + 任意の指数部 `e[+-]N` + 任意の `n`
 *
 * リテラルを途中で切らず丸ごと 1 字句にし、`0x1F` の `0` や `1e3` の `1` を単独で拾わないようにする。
 */
const _NUMBER_LITERAL_PATTERN =
  /0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?/;

/**
 * 識別子の 2 文字目以降を構成する文字 (文字クラスの中身。`u` フラグ前提)。
 * Unicode の ID_Continue に `$`・ZWNJ (U+200C)・ZWJ (U+200D) を加えたもの。
 */
const _IDENTIFIER_PART_CHARS = String.raw`\p{ID_Continue}$\u200C\u200D`;

/** 識別子 1 個分 (字句の切り出し用)。先頭は ID_Start・`$`・`_`。 */
const _IDENTIFIER_TOKEN_PATTERN = new RegExp(String.raw`[\p{ID_Start}$_][${_IDENTIFIER_PART_CHARS}]*`, 'u');

/** 直前が識別子文字でないこと (キーワードを識別子の末尾から拾わないための境界。`u` フラグ前提)。 */
const _NOT_AFTER_IDENTIFIER = `(?<![${_IDENTIFIER_PART_CHARS}])`;

/** 直後の `!` / `/` を単項否定・正規表現の開始とみなすキーワード (`return !ok`・`return /re/` 等)。 */
const _OPERAND_KEYWORDS =
  `${_NOT_AFTER_IDENTIFIER}(?:return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new)`;

/** 演算子・記号 1 個分 (字句の切り出し用)。長いものから並べ、最後は任意の 1 文字。 */
const _OPERATOR_TOKEN_PATTERN = />>>=?|>>=?|<<=?|=>|===|!==|!=|==|&&|\|\||\?\?|<=|>=|<|>|\S/;

/**
 * 字句を切り出す正規表現。
 *
 * 識別子・数値を 1 字句として先に取り、識別子内の `true` や数字を拾わないようにする。
 * 演算子は長いものから並べ、`!==` の `!` や `>>` の `>` を単独の字句にしない。
 */
const _TOKEN_PATTERN = new RegExp(
  [_IDENTIFIER_TOKEN_PATTERN, _NUMBER_LITERAL_PATTERN, _OPERATOR_TOKEN_PATTERN]
    .map((pattern) => pattern.source)
    .join('|'),
  'gu',
);

/** 識別子を構成する文字。直後に空白なしで `<` が続けばジェネリクスの開きとみなす。 */
const _IDENTIFIER_CHAR_PATTERN = new RegExp(`[${_IDENTIFIER_PART_CHARS}]`, 'u');

/** import 文の行 (先頭の `import` キーワード)。行内の候補ごと対象外にする。 */
const _IMPORT_LINE_PATTERN = /^\s*import\b/;

/** ジェネリクスの閉じになりうる字句 (`>` の連なり)。 */
const _GENERIC_CLOSE_PATTERN = /^>+$/;

/** 直前 (空白を除く) がこの文字で終わる `!` は、単項否定ではなく後置の非 null 表明 / 確定代入表明とみなす。 */
const _POSTFIX_BANG_PRECEDER_PATTERN = new RegExp(String.raw`[${_IDENTIFIER_PART_CHARS})\]]$`, 'u');

/** 直前がこのキーワードで終わる `!` は、識別子文字の後でも単項否定とみなす (`return !ok` 等)。 */
const _UNARY_KEYWORD_PATTERN = new RegExp(`${_OPERAND_KEYWORDS}$`, 'u');

/** 接頭辞付き (2/8/16 進) の数値リテラル。1: 基数文字、2: 桁 (`_` 込み)、3: `n` 接尾辞。 */
const _PREFIXED_NUMBER_PATTERN = /^0([xXbBoO])([\da-fA-F_]+)(n?)$/;

/**
 * 指数部なしの 10 進数値リテラル。1: 整数部 (空可)、2: 小数部 (`.` 込み)、3: `n` 接尾辞。
 * 先読みで数字を 1 個以上要求し、`.` や `_` 単独には一致させない。
 */
const _DECIMAL_NUMBER_PATTERN = /^(?=\.?\d)([\d_]*)(\.[\d_]*)?(n?)$/;

/** 接頭辞の基数文字 (小文字) → 基数。 */
const _RADIXES: ReadonlyMap<string, number> = new Map([['x', 16], ['b', 2], ['o', 8]]);

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

/** 接頭辞付き数値リテラルを n+1 にし、同じ基数・接頭辞・`n` 接尾辞で返す。対象外なら `undefined`。 */
const _incrementPrefixed = (token: string): string | undefined => {
  const _match = _PREFIXED_NUMBER_PATTERN.exec(token);
  if (!_match) { return undefined; }
  const [, _radixChar, _digits, _suffix] = _match;
  const _value = BigInt(`0${_radixChar}${_digits.replaceAll('_', '')}`) + 1n;
  return `0${_radixChar}${_value.toString(_RADIXES.get(_radixChar.toLowerCase()))}${_suffix}`;
};

/**
 * 10 進数値リテラルを n+1 にした文字列を返す。対象外 (指数部付きを含む) なら `undefined`。
 *
 * 整数部 (空なら 0) だけを `BigInt` で加算し、小数部は元の表記を残す (浮動小数点の丸めを避ける)。
 * 整数部の `_` 区切りは除き、`n` 接尾辞は保持する。
 */
const _incrementDecimal = (token: string): string | undefined => {
  const _match = _DECIMAL_NUMBER_PATTERN.exec(token);
  if (!_match) { return undefined; }
  const [, _integer, _fraction = '', _suffix] = _match;
  return `${BigInt(_integer.replaceAll('_', '') || '0') + 1n}${_fraction}${_suffix}`;
};

/** 数値リテラルを n+1 にした文字列を返す。数値リテラルでない・指数部付きなら `undefined`。 */
const _incrementNumber = (token: string): string | undefined => _incrementPrefixed(token) ?? _incrementDecimal(token);

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

/** 文字列リテラルの引用符。 */
type _Quote = "'" | '"';

/**
 * 行をまたいで引き継ぐ字句走査の状態。
 *
 * - `inBlock`: ブロックコメントの中
 * - `frames`: テンプレートリテラルの入れ子
 * - `quote`: 行末の `\` で次行へ継続した文字列リテラルの引用符 (継続中でなければ `undefined`)
 */
type _ScanState = { inBlock: boolean; frames: _Frame[]; quote?: _Quote };

/**
 * 引用符ごとの文字列リテラル本体 (開き引用符の後、エスケープ込み)。
 * 1: 終端。閉じ引用符、または行継続の `\` (行末の奇数個目)。閉じずに行末に達したら `undefined`。
 */
const _STRING_BODY_PATTERNS: Readonly<Record<_Quote, RegExp>> = {
  "'": /^(?:\\.|[^'\\])*('|\\$)?/,
  '"': /^(?:\\.|[^"\\])*("|\\$)?/,
};

/**
 * 正規表現リテラル (文字クラス・エスケープ込み、フラグ付き)。
 * 閉じ `/` が無ければ行末までを正規表現とみなす。
 */
const _REGEX_LITERAL_PATTERN = /^\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\[])*(?:\/[A-Za-z]*)?/;

/** 直前がこの記号・キーワードで終わる (または行頭の) 位置は、オペランドの直後ではない (`/` は正規表現の開始)。 */
const _REGEX_PRECEDER_PATTERN = new RegExp(String.raw`(?:^|[(,=:[!&|?{};+\-*%<>~^]|${_OPERAND_KEYWORDS})$`, 'u');

/** 後置インクリメント / デクリメント。直後はオペランドの直後とみなす。 */
const _POSTFIX_UPDATE_PATTERN = /(?:\+\+|--)$/;

/**
 * 判定用の行で、閉じた文字列リテラル・テンプレートリテラル・正規表現リテラルの位置に置く
 * オペランドのプレースホルダ (どのキーワードの末尾にもならない識別子文字)。
 */
const _OPERAND_PLACEHOLDER = '0';

/**
 * 判定用の行 `before` (位置の直前まで) の末尾がオペランドの終わりなら `true`。
 *
 * 末尾 (空白を除く) が識別子・数値・閉じ括弧・リテラル (プレースホルダ)・後置 `++` / `--` ならオペランドの直後、
 * 行頭・演算子記号・開き括弧・`return` 等のキーワードならオペランドの直後ではない。
 */
const _isAfterOperand = (before: string): boolean => {
  const _preceding = before.trimEnd();
  return _POSTFIX_UPDATE_PATTERN.test(_preceding) || !_REGEX_PRECEDER_PATTERN.test(_preceding);
};

/**
 * 1 行の走査中だけ使う状態。
 *
 * - `code`: ここまでのコード部 (コード以外は空白)
 * - `sig`: ここまでの判定用の行 (コードはそのまま、リテラルは末尾をプレースホルダ、コメントは空白)
 */
type _LineCtx = _ScanState & { code: string; sig: string; hasRegex: boolean };

/** 走査位置から消費した文字数と、その文字列をコードとして残すか。`operand` はリテラル 1 個分を消費したとき `true`。 */
type _Consumed = { len: number; keep: boolean; operand?: boolean };

/**
 * 1 行の走査結果。
 *
 * - `code`: コード以外の文字を空白に置き換えた (桁位置を保つ) 行
 * - `sig`: `code` と同じ桁位置の判定用の行。`_isAfterOperand(sig.slice(0, column - 1))` で位置の直前を判定する
 */
type _LineScan = { code: string; sig: string; hasRegex: boolean; state: _ScanState };

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
    return { len: 1, keep: false, operand: true };
  }
  if (!line.startsWith('${', i)) { return { len: 1, keep: false }; }
  ctx.frames.push({ kind: 'expr', depth: 0 });
  return { len: 2, keep: false };
};

/** 文字列リテラルの引用符なら `true`。 */
const _isQuote = (ch: string): ch is _Quote => Object.hasOwn(_STRING_BODY_PATTERNS, ch);

/**
 * 文字列リテラルの本体 `rest` (開き引用符の後、または継続行の先頭から) を終端まで読む。
 * 行末の `\` で終われば引用状態を次行へ持ち越し、それ以外 (閉じた・閉じずに行末) は持ち越さない。
 */
const _scanString = (rest: string, quote: _Quote, ctx: _ScanState): _Consumed => {
  const [_text = '', _end] = _STRING_BODY_PATTERNS[quote].exec(rest) ?? [];
  ctx.quote = _end === '\\' ? quote : undefined;
  return { len: _text.length, keep: false, operand: true };
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

/** コード部の `/` から始まる 1 歩。コメント・正規表現の開始・除算を見分ける。 */
const _scanSlash = (line: string, i: number, ctx: _LineCtx): _Consumed => {
  if (line.startsWith('//', i)) { return { len: line.length - i, keep: false }; }
  if (line.startsWith('/*', i)) {
    ctx.inBlock = true;
    return { len: 2, keep: false };
  }
  if (_isAfterOperand(ctx.sig)) { return { len: 1, keep: true }; }
  ctx.hasRegex = true;
  // line[i] は '/'。パターンは `^\/` 以降がすべて省略可能なので必ず一致する
  return { len: _REGEX_LITERAL_PATTERN.exec(line.slice(i))![0].length, keep: false, operand: true };
};

/** コード部の 1 歩。コメント・文字列・正規表現・テンプレートの開始を検出する。 */
const _scanCode = (line: string, i: number, ctx: _LineCtx): _Consumed => {
  const _ch = line[i];
  if (_isQuote(_ch)) {
    const _body = _scanString(line.slice(i + 1), _ch, ctx);
    return { ..._body, len: _body.len + 1 };
  }
  if (_ch === '/') { return _scanSlash(line, i, ctx); }
  if (_ch !== '`') { return _scanBrace(_ch, ctx); }
  ctx.frames.push({ kind: 'template' });
  return { len: 1, keep: false };
};

/** 現在の状態に応じた 1 歩を進める。 */
const _scanStep = (line: string, i: number, ctx: _LineCtx): _Consumed => {
  if (ctx.inBlock) { return _scanBlock(line, i, ctx); }
  if (ctx.quote) { return _scanString(line.slice(i), ctx.quote, ctx); }
  return ctx.frames.at(-1)?.kind === 'template' ? _scanTemplate(line, i, ctx) : _scanCode(line, i, ctx);
};

/** 判定用の行に足す、コードとして残さない `len` 文字分。リテラルなら末尾をプレースホルダにする。 */
const _sigMask = (len: number, operand = false): string =>
  operand ? ' '.repeat(len - 1) + _OPERAND_PLACEHOLDER : ' '.repeat(len);

/** 1 行を走査し、コード以外を空白に置き換えた行・判定用の行と次行への状態を返す。 */
const _scanLine = (line: string, state: _ScanState): _LineScan => {
  const _ctx: _LineCtx = {
    inBlock: state.inBlock,
    frames: state.frames.map((frame) => ({ ...frame })),
    quote: state.quote,
    code: '',
    sig: '',
    hasRegex: false,
  };
  let i = 0;
  while (i < line.length) {
    const _step = _scanStep(line, i, _ctx);
    const len = Math.min(_step.len, line.length - i);
    const _text = line.slice(i, i + len);
    _ctx.code += _step.keep ? _text : ' '.repeat(len);
    _ctx.sig += _step.keep ? _text : _sigMask(len, _step.operand);
    i += len;
  }
  const { inBlock, frames, quote } = _ctx;
  return { code: _ctx.code, sig: _ctx.sig, hasRegex: _ctx.hasRegex, state: { inBlock, frames, quote } };
};

/**
 * ジェネリクスとして読み飛ばす字句なら、読み飛ばした後の入れ子の深さを返す。対象外なら `undefined`。
 *
 * 識別子の直後に空白なしで続く `<` と、直前がオペランドでない (式の先頭位置の) `<` を開き、
 * 開いている間の `>` / `>>` / `>>>` を `>` の個数分だけ閉じる。
 *
 * @param prevChar - コード部で `<` の直前の 1 文字
 * @param sigBefore - 判定用の行の `<` より前の部分
 */
const _genericDepthAfter = (token: string, prevChar: string, sigBefore: string, depth: number): number | undefined => {
  if (token === '<' && (_IDENTIFIER_CHAR_PATTERN.test(prevChar) || !_isAfterOperand(sigBefore))) { return depth + 1; }
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
 * 候補は走査結果 `scan` のコード部から拾い、ジェネリクスの開きの判定には判定用の行も使う。
 * ジェネリクスの深さ `depth` は前行から受け取り、行末の深さを返して次行へ持ち越す。
 */
const _lineMutants = (scan: _LineScan, lineText: string, line: number, file: string, depth: number): _LineMutants =>
  [...scan.code.matchAll(_TOKEN_PATTERN)].reduce<_LineMutants>((acc, match) => {
    const _before = scan.code.slice(0, match.index);
    const _depth = _genericDepthAfter(match[0], _before.at(-1) ?? '', scan.sig.slice(0, match.index), acc.depth);
    if (_depth !== undefined) { return { depth: _depth, mutants: acc.mutants }; }
    if (acc.depth > 0 || _isPostfixBang(match[0], _before)) { return acc; }
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
 * 識別子は Unicode (ID_Start / ID_Continue) で判定する (`変数1` の `1`、`日本in` の `in` は識別子の一部)。
 *
 * 置換規則:
 * - relational: `<`↔`<=`、`>`↔`>=`
 * - equality: `===`↔`!==` (`!=` / `==` は対象外)
 * - logical: `&&`↔`||`、`??`→`||`
 * - boolean: `true`↔`false` (識別子の一部は対象外)
 * - number: 数値リテラルを n+1 (識別子の一部は対象外)。10 進の整数・小数 (`.5`→`1.5`、`1_000`→`1001`)、
 *   2/8/16 進 (`0x1F`→`0x20`、基数と接頭辞を保持)、BigInt の `n` 接尾辞を保持。指数部付き (`1e3`) は対象外
 * - negation: 単項 `!` を除去。直前 (空白を除く) が識別子文字・`)`・`]` の `!` は後置の
 *   非 null 表明 / 確定代入表明 (`x!`・`f()!`・`a[0]!`・`let y!: T`) とみなして対象外。
 *   ただし直前が `return` / `typeof` 等のキーワードなら単項否定として扱う
 *
 * 対象外にする範囲:
 * - コメント (`//`、`/* *\/`。ブロックコメントは行をまたいで引き継ぐ)
 * - 文字列リテラル (`'...'` / `"..."`、エスケープ込み)。行末の `\` (奇数個目) で行継続した文字列は
 *   次行の閉じ引用符まで引き継ぎ、閉じた後の同じ行はコードとして扱う。行末に `\` の無い未閉じの文字列はその行で終わる
 * - テンプレートリテラルのテキスト部 (行をまたいで引き継ぐ。`${ ... }` 内はコードとして扱う)
 * - アロー `=>`、シフト `<<` `>>` `>>>` の `<` `>`
 * - **正規表現リテラルを含む行は、正規表現外の候補も含めて行ごと対象外。**
 *   `/` の直前 (空白を除く) が行頭・演算子記号・開き括弧・`return` 等のキーワードなら正規表現の開始、
 *   それ以外 (識別子・数値・閉じ括弧・文字列リテラル・テンプレートリテラル・後置 `++` / `--` の後) は除算とみなす
 * - **型位置のジェネリクス。** 識別子の直後に空白なしで続く `<` をジェネリクスの開きとし、
 *   式の先頭位置 (直前が行頭・演算子記号・開き括弧・`return` 等のキーワードで、オペランドの直後でない) の `<` も
 *   ジェネリック arrow (`<T>(x: T) => x`) / 型アサーション (`<number>y`) の型引数の開きとみなす。
 *   対応する `>` (`>>` / `>>>` は `>` の個数分) で閉じる。開いている間 (深さ > 0) は型引数の内側の
 *   候補 (リテラル・演算子) もすべて対象外。深さは行をまたいで持ち越す (複数行の型引数に対応)。
 *   このため空白なしの比較 `a<b` もジェネリクスとみなして対象外になり、対応する `>` が現れるまで
 *   後続の候補も対象外になる (既知の制限)
 * - `import` で始まる行 (行内の候補ごと)
 *
 * 既知の制限:
 * - リテラル型 (`type T = 0 | 1`、`x: true` などの型注釈中の数値・真偽リテラル) は値と区別できないため変異される。
 *   型注釈の `:` はオブジェクトリテラル `{ a: true }` や三項演算子 `c ? a : b` と字句レベルで区別できないのが理由。
 *   この変異体は型エラーで kill されるノイズになる
 *
 * @param source - 対象ソース (LF / CRLF)
 * @param filePath - Mutant の `file` に記録するパス
 * @returns line 昇順・column 昇順の Mutant 配列。`line` / `column` は 1 始まりで、
 *   `column` は UTF-16 コード単位で数える (サロゲートペアは 2 桁)
 */
export const generateMutants = (source: string, filePath: string): Mutant[] =>
  source.split(/\r?\n/).reduce<{ state: _ScanState; depth: number; mutants: Mutant[] }>((acc, lineText, index) => {
    const _scan = _scanLine(lineText, acc.state);
    const _found = _lineMutants(_scan, lineText, index + 1, filePath, acc.depth);
    const _skipped = _scan.hasRegex || _IMPORT_LINE_PATTERN.test(lineText);
    return {
      state: _scan.state,
      depth: _found.depth,
      mutants: _skipped ? acc.mutants : [...acc.mutants, ..._found.mutants],
    };
  }, { state: { inBlock: false, frames: [] }, depth: 0, mutants: [] }).mutants;
