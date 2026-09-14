// src: skills/_cle-libs/libs/ai/__tests__/unit/endpoint-utils.unit.spec.ts
// @(#): llama エンドポイント URL 正規化ユーティリティのユニットテスト
//       対象: normalizeEndpointUrl / assertEndpointAcceptable
//
// Copyright (c) 2026- atsushifx <https://github.com/atsushifx>
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// ─── BDD modules
import { assertEquals, assertThrows } from '@std/assert';
import { describe, it } from '@std/testing/bdd';

// ─── Internal modules
import { ChatlogError } from '../../../../classes/ChatlogError.class.ts';

// ─── Test target
import { assertEndpointAcceptable, normalizeEndpointUrl } from '../../endpoint-utils.ts';

// ─── Tests

/**
 * `normalizeEndpointUrl` のユニットテストスイート。
 *
 * transport R-002 / DR-14 決定 1 に基づき、設定のサーバ位置値から
 * chat completions の実エンドポイント URL を導出することを検証する。
 *
 * 本関数は純粋な文字列変換であり `fetch` を受け取らず呼ばないため、
 * 正規化の時点でネットワークアクセスは発生しない（AC-019）。
 *
 * テスト ID 範囲: T-LIB-AI-LEP-01-01 〜 T-LIB-AI-LEP-01-05 / T-LIB-AI-LEP-03-01 〜 T-LIB-AI-LEP-03-03
 *
 * @see normalizeEndpointUrl
 */
describe('normalizeEndpointUrl', () => {
  it('[Normal] T-LIB-AI-LEP-01-01: http://host:8080 → http://host:8080/v1/chat/completions', () => {
    assertEquals(normalizeEndpointUrl('http://host:8080'), 'http://host:8080/v1/chat/completions');
  });

  it('[Normal] T-LIB-AI-LEP-01-02: http://host:8080/ → http://host:8080/v1/chat/completions', () => {
    assertEquals(normalizeEndpointUrl('http://host:8080/'), 'http://host:8080/v1/chat/completions');
  });

  it('[Normal] T-LIB-AI-LEP-01-03: http://host:8080/v1 → http://host:8080/v1/chat/completions', () => {
    assertEquals(normalizeEndpointUrl('http://host:8080/v1'), 'http://host:8080/v1/chat/completions');
  });

  // 末尾スラッシュ除去（規則 1）を先に適用してから `v1` セグメント除去（規則 2）を適用する順序を固定する。
  it('[Normal] T-LIB-AI-LEP-01-04: http://host:8080/v1/ → http://host:8080/v1/chat/completions', () => {
    assertEquals(normalizeEndpointUrl('http://host:8080/v1/'), 'http://host:8080/v1/chat/completions');
  });

  // `https` も `http` と同一の規則で受理・正規化されることを固定する（§4.3 条件 3 / R-006）。
  it('[Normal] T-LIB-AI-LEP-01-05: https://host:8443/v1/ が受理され https://host:8443/v1/chat/completions に解決される', () => {
    assertEndpointAcceptable('https://host:8443/v1/');
    assertEquals(normalizeEndpointUrl('https://host:8443/v1/'), 'https://host:8443/v1/chat/completions');
  });

  // 末尾セグメント `v1` の除去は 1 回だけで、繰り返し剥がさない（DR-14 決定 1 / §0.7-1）。
  // 除去をループやグローバル置換に変えると `/v1/chat/completions` へ縮退し、このケースだけが落ちる。
  it('[Edge] T-LIB-AI-LEP-03-01: http://host:8080/v1/v1 は末尾 1 つのみ除去され /v1/chat/completions へ縮退しない', () => {
    assertEquals(normalizeEndpointUrl('http://host:8080/v1/v1'), 'http://host:8080/v1/v1/chat/completions');
  });

  // 段数を 3 に増やしても除去されるのは 1 つだけで、残り 2 段はそのまま基底に残る。
  // 03-01 は「1 段残るか 0 段か」しか見分けられないため、`/v1` の連なりを 1 つへ畳む
  // 変異（`replace(/(\/v1)+$/, '$1')` 相当）を通してしまう。このケースがその抜けを塞ぐ。
  it('[Edge] T-LIB-AI-LEP-03-02: http://host:8080/v1/v1/v1 は末尾 1 つのみ除去され 2 段が基底に残る', () => {
    assertEquals(normalizeEndpointUrl('http://host:8080/v1/v1/v1'), 'http://host:8080/v1/v1/v1/chat/completions');
  });

  // 末尾スラッシュ除去（規則 1）→ `v1` セグメント除去（規則 2）の順序が、`/v1` が二重の
  // 場合でも 1 回ずつしか適用されないことを固定する。結果は 03-01 と一致する。
  it('[Edge] T-LIB-AI-LEP-03-03: http://host:8080/v1/v1/ は末尾スラッシュと v1 を 1 つずつ除去する', () => {
    assertEquals(normalizeEndpointUrl('http://host:8080/v1/v1/'), 'http://host:8080/v1/v1/chat/completions');
  });
});

/**
 * `assertEndpointAcceptable` のユニットテストスイート。
 *
 * transport R-006 / 仕様 §4.3 に基づき、受理条件に違反するサーバ位置値を
 * `ChatlogError('AiError', 'InvalidEndpoint')` で拒否することを検証する（DR-18 決定 1）。
 *
 * AC-019（ネットワークアクセスが発生しないこと）の根拠: 受理判定関数は `fetch` を
 * 引数に取らず、実装内でも呼ばない。判定はサーバ位置値の文字列検査だけで完結するため、
 * throw に至る経路にネットワークアクセスの口が存在しない。
 *
 * テスト ID 範囲: T-LIB-AI-LEP-02-01 〜 T-LIB-AI-LEP-02-07 / T-LIB-AI-LEP-05-01
 *
 * @see assertEndpointAcceptable
 */
describe('assertEndpointAcceptable', () => {
  it('[Error] T-LIB-AI-LEP-02-01: キー省略（undefined）→ ChatlogError(AiError / InvalidEndpoint)', () => {
    const _err = assertThrows(() => assertEndpointAcceptable(undefined), ChatlogError);
    assertEquals(_err.kind, 'AiError');
    assertEquals(_err.subindex, 'InvalidEndpoint');
  });

  // 空文字列はキーが存在するだけで値が無く、条件 1 の「未設定」に含まれる（§ 4.3 条件 1）。
  it('[Error] T-LIB-AI-LEP-02-02: 空文字列 → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _err = assertThrows(() => assertEndpointAcceptable(''), ChatlogError);
    assertEquals(_err.kind, 'AiError');
    assertEquals(_err.subindex, 'InvalidEndpoint');
  });

  // スキームを持たない相対パスは絶対 URL として解釈できず、接続先ホストが定まらない（§ 4.3 条件 2）。
  it('[Error] T-LIB-AI-LEP-02-03: 相対パス /v1/chat → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _err = assertThrows(() => assertEndpointAcceptable('/v1/chat'), ChatlogError);
    assertEquals(_err.kind, 'AiError');
    assertEquals(_err.subindex, 'InvalidEndpoint');
  });

  // `ws` は URL としてパースできるが、chat completions を送れる転送方式ではない（§ 4.3 条件 3）。
  it('[Error] T-LIB-AI-LEP-02-04: ws スキーム ws://host:8080 → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _err = assertThrows(() => assertEndpointAcceptable('ws://host:8080'), ChatlogError);
    assertEquals(_err.kind, 'AiError');
    assertEquals(_err.subindex, 'InvalidEndpoint');
  });

  // query を持つ値は正規化すると `/v1/chat/completions?x=1` のような意味の定まらない URL になる（§ 4.3 条件 4）。
  it('[Error] T-LIB-AI-LEP-02-05: query 文字列 http://host:8080?x=1 → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _err = assertThrows(() => assertEndpointAcceptable('http://host:8080?x=1'), ChatlogError);
    assertEquals(_err.kind, 'AiError');
    assertEquals(_err.subindex, 'InvalidEndpoint');
  });

  // フラグメントを持つ値も query と同じく、正規化すると `/v1/chat/completions#frag` のような意味の定まらない URL になる（§ 4.3 条件 5）。
  it('[Error] T-LIB-AI-LEP-02-06: フラグメント http://host:8080#frag → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _err = assertThrows(() => assertEndpointAcceptable('http://host:8080#frag'), ChatlogError);
    assertEquals(_err.kind, 'AiError');
    assertEquals(_err.subindex, 'InvalidEndpoint');
  });

  // userinfo は認証情報の送出にあたり、REQ-C-001 が Out of Scope に置いた事項に抵触する（§ 4.3 条件 6）。
  it('[Error] T-LIB-AI-LEP-02-07: userinfo http://user:pass@host:8080 → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _err = assertThrows(() => assertEndpointAcceptable('http://user:pass@host:8080'), ChatlogError);
    assertEquals(_err.kind, 'AiError');
    assertEquals(_err.subindex, 'InvalidEndpoint');
  });

  // 条件 4 は「query 文字列（`?`）を含む」を字面で拒否する。値を持たない `?` 単体も「含む」に該当する。
  // パース済み `URL.search` の値を見る実装は空の `?` を取りこぼし、正規化が生文字列を連結するため
  // `http://host:8080?/v1/chat/completions` という query にパスを飲まれた URL を生む（§4.3 条件 4）。
  it('[Edge] T-LIB-AI-LEP-04-01: 空の query 記号 http://host:8080? → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _err = assertThrows(() => assertEndpointAcceptable('http://host:8080?'), ChatlogError);
    assertEquals(_err.kind, 'AiError');
    assertEquals(_err.subindex, 'InvalidEndpoint');
  });

  // 条件 5 も同じく「フラグメント（`#`）を含む」を字面で拒否する。空の `#` の取りこぼしは query より重く、
  // 連結したパスがフラグメントへ飲まれ `http://host:8080#/v1/chat/completions` というパスを持たない
  // URL になる。ルートへ POST することになり、設定ミスがネットワーク層まで露見しない（§4.3 条件 5）。
  it('[Edge] T-LIB-AI-LEP-04-02: 空のフラグメント記号 http://host:8080# → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _err = assertThrows(() => assertEndpointAcceptable('http://host:8080#'), ChatlogError);
    assertEquals(_err.kind, 'AiError');
    assertEquals(_err.subindex, 'InvalidEndpoint');
  });

  // 受理判定はパース済み `URL` を検査するが、正規化（R-002）は生文字列を連結する。`URL` は前後の
  // 空白を除去して正常にパースするため、空白付きの値は判定をすり抜けたうえで
  // `http://host:8080/v1 /v1/chat/completions` のような空白混じりの URL を生む。
  // 判定を生文字列で行えば、この乖離ごと閉じられる。
  it('[Edge] T-LIB-AI-LEP-04-03: 前後に空白を含む値 → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _cases = ['http://host:8080/v1 ', ' http://host:8080'];
    for (const value of _cases) {
      const _err = assertThrows(() => assertEndpointAcceptable(value), ChatlogError, undefined, value);
      assertEquals(_err.kind, 'AiError', value);
      assertEquals(_err.subindex, 'InvalidEndpoint', value);
    }
  });

  // 条件 6 は「userinfo（`user:pass@`）を含む」を字面で拒否する。`URL.username` / `URL.password` は
  // 区切りだけが置かれた値に対してどちらも空文字列を返すため、値を見る実装は `@` を取りこぼす。
  // 生文字列に userinfo の区切りが現れる時点で、設定として意図の定まらない値である（§4.3 条件 6）。
  it('[Edge] T-LIB-AI-LEP-04-04: userinfo の区切りのみを含む値 → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _cases = ['http://@host:8080', 'http://:@host:8080'];
    for (const value of _cases) {
      const _err = assertThrows(() => assertEndpointAcceptable(value), ChatlogError, undefined, value);
      assertEquals(_err.kind, 'AiError', value);
      assertEquals(_err.subindex, 'InvalidEndpoint', value);
    }
  });

  // 条件 3 の受理側は `https`（T-LIB-AI-LEP-01-05）だけが固定されており、許可スキーム集合から
  // `'http:'` を落とす変異が全件素通りする。既定の構成が `http` である以上、この受理は正常系そのもので
  // あり、拒否テストの裏返しでは代替できない（§4.3 条件 3 / DR-14 決定 2）。
  it('[Normal] T-LIB-AI-LEP-04-05: http スキーム http://host:8080 は受理され throw しない', () => {
    assertEndpointAcceptable('http://host:8080');
  });

  // R-006 の目的は「ネットワークアクセス前に設定ミスを診断する」ことであり、diagnostics の実体は
  // detail である。既存の拒否テストは kind / subindex しか見ないため、6 つの `_invalidEndpoint(...)` へ
  // 同一文字列を渡す変異を素通しする。ここでは文言そのものを期待値にせず（変更で壊れるだけで
  // 診断価値を守れない）、条件 1〜6 の detail が相異なることと、認証情報の流出防止として
  // どの detail にも入力値そのものが現れないことを固定する。
  // `ChatlogError` は detail を独立したプロパティに保持せず `message` へ埋め込むため、
  // 収集対象は `message`（`'AI Error: ' + detail`）とする。接頭辞は定数なので相異性は detail の相異性と等価。
  // 条件 1 の代表は `undefined` を用いる。空文字列は `includes('')` が常に真となり混入検査が成立しない
  // （空文字列自体の拒否は T-LIB-AI-LEP-02-02 が固定している）。
  it('[Edge] T-LIB-AI-LEP-04-06: §4.3 条件 1〜6 の detail は相異なり、入力値を含まない', () => {
    const _rejectedInputs: readonly (string | undefined)[] = [
      undefined, // 条件 1: 未設定
      '/v1/chat', // 条件 2: 絶対 URL でない
      'ws://host:8080', // 条件 3: 受理対象外スキーム
      'http://host:8080?x=1', // 条件 4: query 文字列
      'http://host:8080#frag', // 条件 5: フラグメント
      'http://user:pass@host:8080', // 条件 6: userinfo
    ];

    const _messages = _rejectedInputs.map((value) => {
      const _err = assertThrows(() => assertEndpointAcceptable(value), ChatlogError, undefined, String(value));
      return _err.message;
    });

    assertEquals(new Set(_messages).size, _messages.length, `detail が重複している: ${JSON.stringify(_messages)}`);

    _rejectedInputs.forEach((value, index) => {
      if (value === undefined) { return; }
      assertEquals(_messages[index].includes(value), false, `detail に入力値が混入している: ${_messages[index]}`);
    });
  });

  // 条件 6 の userinfo は、オーソリティの区切りが literal `//` でなくても成立する。WHATWG URL は
  // special scheme（`http` / `https`）でバックスラッシュをスラッシュと同一視するため、次の 2 形は
  // いずれも `protocol === 'http:'` / `username === 'user'` / `password === 'pass'` としてパースされ、
  // 条件 3 を通過する。区切りを `//` に限定した検査はここで空のオーソリティへフォールバックし、
  // `@` を見失って fail-open になる（拒否規則が「該当なし」で素通りする）。
  //
  // 実測（修正前）— 資格情報が fetch まで到達する:
  //   'http:\\user:pass@host:8080'  → 正規化 'http:\\user:pass@host:8080/v1/chat/completions'
  //                                 → new Request(...).url 'http://user:pass@host:8080/v1/chat/completions'
  //   'http:/\user:pass@host:8080'  → 正規化 'http:/\user:pass@host:8080/v1/chat/completions'
  //                                 → new Request(...).url 'http://user:pass@host:8080/v1/chat/completions'
  // REQ-C-001 が Out of Scope に置いた認証情報の送出そのものであり、受理してはならない。
  //
  // ここで検証するのは受理判定の throw だけに留める。`normalizeEndpointUrl` は受理済みの値だけを
  // 受け取る前提の純粋な文字列連結であり、拒否を担わない。その戻り値や `Request` の解決結果を
  // 期待値に据えると、判定を正した後も落ち続けるテストになる（AC-019 上も、判定経路に
  // ネットワークアクセスの口を持ち込まない形が正しい）。
  //
  // T-LIB-AI-LEP-04-04 は `//` 形（`http://@host:8080` / `http://:@host:8080`）のみを固定しており、
  // この入力形を覆っていない。
  it('[Edge] T-LIB-AI-LEP-04-07: バックスラッシュ区切りのオーソリティに含まれる userinfo → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _cases = ['http:\\\\user:pass@host:8080', 'http:/\\user:pass@host:8080'];
    for (const value of _cases) {
      const _err = assertThrows(() => assertEndpointAcceptable(value), ChatlogError, undefined, value);
      assertEquals(_err.kind, 'AiError', value);
      assertEquals(_err.subindex, 'InvalidEndpoint', value);
    }
  });

  // WHATWG URL の special authority ignore slashes 状態は、スキーム区切りの後に続く `/` と `\` の
  // 「任意長の連続」を読み飛ばしてからオーソリティを読み始める。したがって区切りが 2 本でも
  // 3 本でも 6 本でも、混在していても、解決結果は同一の `http://user:pass@host:8080` になる。
  //
  // 一方、区切りをちょうど 2 本だけ消費する検査（`/^[^:]+:\/\/([^/]*)/` 相当）は、3 本以上並ぶと
  // オーソリティとして空文字列を切り出す。空文字列は `@` を含まないため条件 6 が「該当なし」で
  // 素通りし、拒否規則が fail-open になる（資格情報がそのまま fetch まで到達する）。
  //
  // これは 4 つの個別入力ではなく「区切りの連続」というクラスである。本数を固定して数例だけ
  // 並べると、次の本数で同じ穴が開く。ここでは本数 3〜6・`/` と `\` の混在を同一の期待で
  // まとめ、区切りの本数と種別に依存しない規則であることを読み取れる形にする。
  //
  // T-LIB-AI-LEP-04-04 は `//`（2 本）形、T-LIB-AI-LEP-04-07 はバックスラッシュを含む 2 本形のみを
  // 固定しており、3 本以上のクラスを覆っていない。
  it('[Edge] T-LIB-AI-LEP-04-08: スキーム区切りの後に区切りが 3 つ以上並ぶ userinfo → ChatlogError(AiError / InvalidEndpoint)', () => {
    // コメントは値、コード側はソース上のエスケープ。`\\\\` は 2 本のバックスラッシュを表す。
    const _cases = [
      'http:///user:pass@host:8080', // スラッシュ 3 本
      'http:////user:pass@host:8080', // スラッシュ 4 本
      'http:\\\\\\user:pass@host:8080', // バックスラッシュ 3 本
      'http:/\\/user:pass@host:8080', // スラッシュ / バックスラッシュ混在 3 本
      'http:\\/\\/\\/user:pass@host:8080', // 混在 6 本
    ];

    for (const value of _cases) {
      // 前提の確認: いずれも区切りをスラッシュへ寄せると 3 本以上連続する（本テストが対象とするクラス）。
      assertEquals(/^[^:]+:\/{3,}/.test(value.replace(/\\/g, '/')), true, value);

      const _err = assertThrows(() => assertEndpointAcceptable(value), ChatlogError, undefined, value);
      assertEquals(_err.kind, 'AiError', value);
      assertEquals(_err.subindex, 'InvalidEndpoint', value);
    }
  });

  // スキーム区切りの後に区切りをほとんど持たない形も、WHATWG URL では special authority ignore
  // slashes を経て `http://user:pass@host:8080` へ解決される。resolve 後に userinfo を伴う以上、
  // 受理してはならない（§4.3 条件 6）。
  //
  // 固定するのは拒否されることだけに留める。userinfo の検出は `URL.username` / `URL.password` へ
  // 一本化する方針に転換したため（生文字列からの手書き抽出をやめる）、これらの入力は
  // パーサが `username === 'user'` を返すことで通常の userinfo 規則に捕まる。
  // 「オーソリティを切り出せない値」の fail-closed ガードは方針転換とともに不要になるので、
  // かつてここで固定していた「detail が userinfo の detail と相異なる」表明は削除した。
  // 特定の内部規則へ到達したことを期待値に据えると、その規則の廃止を妨げてしまう。
  it('[Edge] T-LIB-AI-LEP-04-09: 区切りをほとんど持たない形の userinfo → ChatlogError(AiError / InvalidEndpoint)', () => {
    // コメントは値。`http:\user:pass@host:8080` は区切りを寄せるとスラッシュ 1 本になる。
    const _cases = [
      'http:user:pass@host:8080', // 区切り 0 本
      'http:\\user:pass@host:8080', // 区切り 1 本（バックスラッシュ）
    ];

    for (const value of _cases) {
      const _err = assertThrows(() => assertEndpointAcceptable(value), ChatlogError, undefined, value);
      assertEquals(_err.kind, 'AiError', value);
      assertEquals(_err.subindex, 'InvalidEndpoint', value);
    }
  });

  // WHATWG URL パーサは入力から ASCII tab（U+0009）・LF（U+000A）・CR（U+000D）を「除去」してから
  // パースする。したがって `http://\t/user:pass@host:8080` は tab が消えて `http:///user:pass@host:8080`
  // となり、special authority ignore slashes を経て `http://user:pass@host:8080` へ解決される。
  //
  // 生文字列からオーソリティを切り出す検査は、これらの文字を残したまま境界を認識するため、
  // tab / LF / CR が区切りの間に挟まった時点でオーソリティの読み取り位置がずれ、`@` を見失う
  // （拒否規則が「該当なし」で素通りし、資格情報がそのまま fetch まで到達する fail-open）。
  //
  // 実測（修正前）— いずれも受理され、`new Request(normalizeEndpointUrl(v)).url` が
  // `http://user:pass@host:8080/v1/chat/completions` になる。
  //
  // これは 3 文字それぞれの個別事象ではなく「パーサが除去する制御文字」というクラスである。
  // 1 文字ずつ潰す修正を招かないよう、3 文字と反復（tab 2 個）を同一の期待でテーブルに並べる。
  // 根治は userinfo の検出を `URL.username` / `URL.password` へ一本化し、生文字列の手書き抽出を
  // やめること（パーサとの乖離そのものを断つ）。
  it('[Edge] T-LIB-AI-LEP-04-10: パーサが除去する制御文字を挟んだ userinfo → ChatlogError(AiError / InvalidEndpoint)', () => {
    const _cases = [
      'http://\t/user:pass@host:8080', // ASCII tab
      'http://\n/user:pass@host:8080', // LF
      'http://\r/user:pass@host:8080', // CR
      'http://\t\t/user:pass@host:8080', // tab の反復
    ];

    for (const value of _cases) {
      const _err = assertThrows(() => assertEndpointAcceptable(value), ChatlogError, undefined, JSON.stringify(value));
      assertEquals(_err.kind, 'AiError', JSON.stringify(value));
      assertEquals(_err.subindex, 'InvalidEndpoint', JSON.stringify(value));
    }
  });

  // 区切りが 3 本以上でも userinfo を伴わない値は、§4.3 条件 1〜6 のいずれにも該当しない。
  // 条件 7 により受理し、R-002 の正規化へ進むのが仕様どおりの扱いである
  // （`new Request('http:///host:8080/v1/chat/completions').url` は
  // `http://host:8080/v1/chat/completions` に解決され、接続先は意図どおり定まる）。
  //
  // T-LIB-AI-LEP-04-08 は同じ区切り形を userinfo 付きで拒否する側だけを固定しているため、
  // 「区切りが 3 本以上なら拒否」という過剰な規則を入れても既存テストは全件通ってしまう。
  // 受理側をここで固定し、条件 6 の検査強化が正常系を巻き込まないことを保証する。
  it('[Normal] T-LIB-AI-LEP-04-11: 区切り 3 本で userinfo を持たない値は受理され正規化される', () => {
    assertEndpointAcceptable('http:///host:8080');
    assertEquals(normalizeEndpointUrl('http:///host:8080'), 'http:///host:8080/v1/chat/completions');
  });

  // 条件 6（userinfo）の検査は 6 本の拒否テスト（02-07 / 04-04 / 04-07 〜 04-10）で守られている一方、
  // 受理側の表明が `https`（01-05）と `http`（04-05）の 2 点しか無い。検査を強める次の変更が
  // 正常系を巻き込んでも、拒否テストは全件通ったままなので検知できない。
  // ここでは「受理すべき値の一覧」として読める形で並べ、条件 1〜6 のいずれにも該当しない値が
  // 条件 7 により受理されること（= throw しないこと）だけを固定する。
  //
  // 正規化結果は期待値に据えない。`/v1/v1` と `/v1/` の正規化は 03-01 / 01-04 が、
  // 区切り 3 本の正規化は 04-11 が既に固定しており、役割が異なる（入力の重複を理由に
  // どちらかを削ると、受理表明か正規化表明のいずれかが失われる）。
  //
  // detail には入力値が載らない（04-06）ため、素の呼び出しで落とすとどの行が壊れたか分からない。
  // throw を捕捉して入力値をメッセージに添える。
  it('[Normal] T-LIB-AI-LEP-05-01: 条件 1〜6 に該当しない値は受理され throw しない', () => {
    const _cases = [
      // 第 3 項（生文字列と `pathname` の `@` 数の比較）の境界そのもの。パス内の `@` は
      // `pathname` 側にも現れるため数が釣り合う。第 3 項を「`@` を含むなら拒否」へ素朴化すると
      // この行だけが落ちる。
      'http://host/a@b',
      // IPv6 リテラル。ホストとポートの境界を `split(':')` 等で手書きすると `[::1]` を壊す。
      'http://[::1]:8080',
      // スキームは大小文字を区別しない。`URL.protocol` は小文字へ正規化されるため受理される。
      'HTTP://host:8080',
      // 末尾セグメントが `v1` の二重。受理条件のいずれにも触れない。
      'http://host:8080/v1/v1',
      // 末尾スラッシュ。正規化規則 1 の対象であって、拒否理由ではない。
      'http://host:8080/v1/',
      // 区切り 3 本かつ userinfo 無し。「区切りが 3 本以上なら拒否」という過剰な規則を殺す。
      'http:///host:8080',
    ];

    for (const value of _cases) {
      let _thrown: unknown = undefined;
      try {
        assertEndpointAcceptable(value);
      } catch (error) {
        _thrown = error;
      }
      assertEquals(_thrown, undefined, `受理されるべき値が拒否された: ${JSON.stringify(value)}`);
    }
  });
});
