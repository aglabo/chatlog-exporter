// src: skills/_cle-libs/libs/ai/endpoint-utils.ts
// @(#): llama エンドポイント URL 正規化ユーティリティ
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { ChatlogError } from '../../classes/ChatlogError.class.ts';

/** サーバ位置値の基底に連結する chat completions のパス（transport R-002 / DR-14 決定 1）。 */
const _CHAT_COMPLETIONS_PATH = '/v1/chat/completions';

/**
 * 受理するスキームの集合（仕様 §4.3 条件 3 / DR-14 決定 2）。
 *
 * `URL.protocol` はコロンを含む形（`'http:'`）を返すため、比較できるようコロン込みで持つ。
 * chat completions は HTTP 上の POST で送るため、`ws` / `file` 等はここに含めない。
 */
const _ACCEPTED_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/** 末尾スラッシュ 1 つにマッチするパターン（正規化規則 1）。複数スラッシュは剥がさない。 */
const _TRAILING_SLASH = /\/$/;

/**
 * 末尾セグメント `v1` にマッチするパターン（正規化規則 2）。
 *
 * スラッシュを含めてアンカーするため `/apiv1` のようなセグメントは対象外となる。
 * 非グローバルな `replace` で 1 回だけ適用し、`/v1/v1` を `/v1` へ縮退させない（T-10-03-01）。
 */
const _TRAILING_V1_SEGMENT = /\/v1$/;

/**
 * 設定のサーバ位置値から chat completions の実エンドポイント URL を導出する。
 *
 * 末尾スラッシュを 1 つ除去し、除去後の末尾セグメントが `v1` であればそれも 1 つだけ除去した
 * 基底に `/v1/chat/completions` を連結する（transport R-002 / DR-14 決定 1）。
 * 純粋な文字列変換であり `fetch` を受け取らず呼ばないため、ネットワークアクセスは発生しない（AC-019）。
 *
 * @param value - 設定のサーバ位置値（例: `'http://host:8080'` / `'http://host:8080/'` / `'http://host:8080/v1'`）
 * @returns 正規化されたエンドポイント URL（例: `'http://host:8080/v1/chat/completions'`）
 */
export const normalizeEndpointUrl = (value: string): string => {
  const _base = value
    .replace(_TRAILING_SLASH, '')
    .replace(_TRAILING_V1_SEGMENT, '');
  return `${_base}${_CHAT_COMPLETIONS_PATH}`;
};

/**
 * サーバ位置値の受理条件違反を表す例外を組み立てる。
 *
 * 分類は中断側の `InvalidEndpoint` に固定する（DR-18 決定 1 により kind は一律 `AiError`）。
 * 設定値の誤りはリトライで解消しないため、一括処理を中断させる分類が正しい。
 * detail には受理できなかった理由だけを載せ、サーバ位置値そのものは載せない
 * （userinfo を含む値を受け取った場合に認証情報を露出させないため）。
 */
const _invalidEndpoint = (detail: string): ChatlogError => new ChatlogError('AiError', 'InvalidEndpoint', detail);

/**
 * サーバ位置値が未設定かどうかを判定する（仕様 §4.3 条件 1）。
 *
 * 「未設定」はキー省略（`undefined`）と空文字列（`''`）の両方を指す。設定ファイルにキーだけ
 * 残して値を消した状態は、キーごと省略した状態と区別せず同一に扱う。
 */
const _isUnset = (value: string | undefined): value is undefined | '' => value === undefined || value === '';

/**
 * サーバ位置値を絶対 URL としてパースする（仕様 §4.3 条件 2）。
 *
 * 基底 URL を渡さずに `URL` コンストラクタを呼ぶと、`/v1/chat` のようなスキームを
 * 持たない値は `TypeError` になる。このパース失敗をそのまま拒否理由として扱い、
 * 素の `TypeError` を呼び出し元へ漏らさず `InvalidEndpoint` へ写像する。
 *
 * スキームを持つが受理対象外の値（`ws://host` 等）は `URL` が正常にパースするため、
 * ここでは拒否しない。スキームの検査は条件 3 の担当である。
 *
 * パース済みの `URL` を返すことで、後続の条件判定が同じ値を再パースせずに済む。
 *
 * @param value - 未設定でないことが確定したサーバ位置値
 * @returns パース済みの `URL`
 * @throws {ChatlogError} 絶対 URL として解釈できないとき
 */
const _parseAbsoluteUrl = (value: string): URL => {
  try {
    return new URL(value);
  } catch {
    throw _invalidEndpoint('endpoint is not an absolute URL');
  }
};

/** userinfo の区切り `@` 全件にマッチするパターン。出現回数の比較に使う。 */
const _AT_SIGN = /@/g;

/** 文字列中の `@` の出現回数を数える。 */
const _countAtSigns = (value: string): number => (value.match(_AT_SIGN) ?? []).length;

/**
 * サーバ位置値が userinfo を伴うかどうかを判定する（仕様 §4.3 条件 6）。
 *
 * 判定は 2 つの観点の論理和だが、両者の役割は対等ではない。
 *
 * 1. `url.username` / `url.password` が空でない — 値を伴う userinfo を捕まえる。
 *    **単独では不十分**であり、かつ**観点 2 に対しては多重防御（defense-in-depth）である。**
 *    不十分なのは、区切りだけが置かれた `'http://@host:8080'` / `'http://:@host:8080'` で
 *    `username` と `password` がいずれも `''` になるため（T-LIB-AI-LEP-04-04）。
 *    多重防御なのは、`username` / `password` が非空なら生文字列に userinfo の区切り `@` が
 *    あったということであり、観点 2 も必ず成立するため。実測でもこの項を削除して既存テストは
 *    全件通る（削除を殺すテストは存在しない）。**それでも残す**のは、観点 2 の必要十分性が
 *    「条件 4 / 5 が先に `?` と `#` を拒否している」という `_REJECTIONS` の順序に依存するためで
 *    ある。userinfo 検査を前へ動かすとその前提が崩れるが、そのとき観点 1 は値を伴う userinfo を
 *    引き続き捕まえる。
 * 2. 生文字列の `@` の数が `url.pathname` の `@` の数を上回る — **この項が単独で必要十分**。
 *    query（条件 4）とフラグメント（条件 5）は本判定より前に拒否済みなので、`pathname` に
 *    現れない余分な `@` の残る置き場所はオーソリティ部だけであり、そこに `@` があることは
 *    userinfo を伴うことと同値になる。
 *    逆に、この項を「`value` に `@` が含まれるなら拒否」へ素朴化してはならない。パス内の
 *    `@`（`'http://host/a@b'`）は userinfo ではなく、受理すべき値を巻き込む
 *    （T-LIB-AI-LEP-05-01）。数の比較であることが本質である。
 *
 * かつては生文字列を手書きの正規表現でオーソリティ部へ切り出し、そこに `@` があるかを見ていた。
 * この方式は境界の認識を自前で推測するため WHATWG URL パーサと乖離し、同一クラスの fail-open を
 * 3 度続けて生んだ（バックスラッシュ区切り → 区切りの 3 本以上の連続 →
 * パーサが除去する ASCII tab / LF / CR の挟み込み）。いずれも資格情報がそのまま `fetch` まで
 * 到達する穴であった。境界の判断はすべてパーサへ委ね、生文字列は「パーサ由来の `url.pathname` に
 * 現れない `@` があるか」という数の比較にしか使わない。手書きの抽出へ戻してはならない。
 */
const _hasUserinfo = (value: string, url: URL): boolean =>
  url.username !== '' || url.password !== '' || _countAtSigns(value) > _countAtSigns(url.pathname);

/**
 * 先頭または末尾の「C0 制御文字または空白」にマッチするパターン。値の内部は対象としない。
 *
 * 文字集合は `\s` と `[\u0000-\u0020]` の和集合とする。WHATWG URL パーサが入力の前後から
 * 除去するのは C0 control or space（U+0000〜U+0020）であり、`\s` だけでは U+0000〜U+0008 /
 * U+000B〜U+001F を取りこぼす。取りこぼすとパーサが除去する文字が正規化へ残り、「受理した表現」と
 * 「正規化する表現」が食い違う（条件 7）。逆に `\s` 側だけが持つ U+00A0 / U+FEFF はパーサが
 * 除去しないため、拒否するのは過剰だが害は無く、受理すべき値を 1 件も巻き込まない。
 * 和集合を採ることで、どちらの向きにも fail-closed になる。
 */
// C0 制御文字は意図してこの文字集合へ含めている（パーサが除去する範囲へ合わせるため）。
// deno-lint-ignore no-control-regex
const _EDGE_WHITESPACE = /^[\s\u0000-\u0020]|[\s\u0000-\u0020]$/;

/**
 * サーバ位置値の受理条件のうち、パース後に検査するもの（仕様 §4.3 条件 4〜6 および空白）。
 *
 * パース済み `URL` の各プロパティは「値」しか見えないため、`http://host:8080?` のように
 * 区切り記号だけを持つ値を取りこぼす。仕様 §4.3 は条件 4 を「query 文字列（`?`）を含む」、
 * 条件 5 を「フラグメント（`#`）を含む」と字面で規定しているため、生文字列を直接検査する。
 * 正規化（R-002）が生文字列を連結する以上、判定も同じ生文字列を対象にすることで
 * 「受理した表現」と「正規化する表現」の乖離が生じない。
 *
 * 条件 6 の userinfo 検査だけはパース済み `URL` を併せて受け取る（`_hasUserinfo`）。
 * オーソリティ境界の判断をパーサへ委ねるためであり、生文字列の手書き抽出は行わない。
 *
 * 前後の空白は仕様の表に条件として現れないが、`URL` は空白を除去してパースする一方で
 * 正規化は空白を残したまま連結するため、受理すると `http://host:8080/v1 /v1/chat/completions`
 * のような値を生む。条件 7 が「受理し、R-002 の正規化へ進む」と定める以上、
 * 正規化に耐えない表現は trim して通すのではなく拒否する。
 *
 * detail は拒否理由ごとに相異なる文字列とし、サーバ位置値そのものは載せない
 * （条件 6 の入力は認証情報を含むため、detail へ入れるとログへ資格情報が流出する）。
 */
const _REJECTIONS: readonly {
  readonly violates: (value: string, url: URL) => boolean;
  readonly detail: string;
}[] = [
  {
    violates: (value) => _EDGE_WHITESPACE.test(value),
    detail: 'endpoint must not contain leading or trailing whitespace',
  },
  { violates: (value) => value.includes('?'), detail: 'endpoint must not contain a query string' },
  { violates: (value) => value.includes('#'), detail: 'endpoint must not contain a fragment' },
  { violates: _hasUserinfo, detail: 'endpoint must not contain userinfo' },
];

/**
 * 設定のサーバ位置値が受理条件を満たすことを表明する（transport R-006 / 仕様 §4.3）。
 *
 * 拒否するのは条件 1（キー省略および空文字列）、条件 2（絶対 URL でない）、
 * 条件 3（スキームが `http` / `https` のいずれでもない）、および `_REJECTIONS` が持つ残りの条件
 * （前後の空白、条件 4 の query 文字列、条件 5 のフラグメント、条件 6 の userinfo）。
 * 条件 1〜3 は分岐の形が揃わないため個別に並べ、以降はテーブルに一本化する。
 *
 * 拒否時の detail には理由だけを載せ、サーバ位置値そのものは載せない。条件 6 の入力は
 * 認証情報そのものを含むため、値を detail へ入れるとログへ資格情報が流出する。
 *
 * 受理判定はネットワークアクセスの前段に位置づけられる。本関数は `fetch` を引数に取らず
 * 呼びもしないため、判定の時点でネットワークアクセスは発生しない（AC-019）。
 *
 * @param value - 設定のサーバ位置値。設定にキーが無い場合は `undefined` が渡る
 * @throws {ChatlogError} サーバ位置値が未設定・絶対 URL でない・スキームが `http` / `https` でない・前後に空白を含む・query 文字列を含む・フラグメントを含む・userinfo を含むとき（`kind: 'AiError'` / `subindex: 'InvalidEndpoint'`）
 */
export const assertEndpointAcceptable = (value: string | undefined): void => {
  if (_isUnset(value)) { throw _invalidEndpoint('endpoint is not configured'); }
  const _url = _parseAbsoluteUrl(value);
  if (!_ACCEPTED_PROTOCOLS.includes(_url.protocol)) {
    throw _invalidEndpoint('endpoint scheme is not http or https');
  }
  const _violation = _REJECTIONS.find((rejection) => rejection.violates(value, _url));
  if (_violation !== undefined) { throw _invalidEndpoint(_violation.detail); }
};
