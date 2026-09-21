---
title: "avalon の llama-server コンテキスト長を最大化する手順"
module: "libs/ai-backend"
status: Draft
created: "2026-09-21"
---

<!-- textlint-disable
  ja-technical-writing/sentence-length,
  ja-technical-writing/max-comma,
  -->
<!-- markdownlint-disable line-length -->

> これは `notes/` 配下の作業メモである。安定・確定した仕様ではない。
> avalon はこのリポジトリの管理外（LAN 上の別マシン）であり、設定変更は本手順を人手で実行して行う。
>
> **2026-09-21 に Phase B を適用済み。** 起動スクリプトは avalon の `~/bin/avalon-llama.sh`。
> 適用後の実測は §7、残りの記入欄（VRAM・KV self size 等）は avalon 上でしか取れない。

GitHub: <https://github.com/aglabo/chatlog-exporter/issues/478> / beads: `cle-kju`

## 1. 背景と現状

AI バックエンド `llama/avalon`（`config.yaml` の `llamaEndpoint: http://avalon:8080/`）は、
1 リクエストあたりのコンテキストが 32768 トークンしかなく、実運用の入力を処理しきれない。

2026-09-21 に HTTP から実測した現状は次のとおり。

| 項目             | 実測値                                            | 取得元             |
| ---------------- | ------------------------------------------------- | ------------------ |
| サーバ           | llama.cpp server `b10688-c589f0ed1`               | `/props`           |
| モデル           | `lmstudio-community/Qwen3.5-35B-A3B-GGUF:Q4_K_M`  | `/props`           |
| モデルファイル   | `/mnt/exdisk/llm/.../Qwen3.5-35B-A3B-Q4_K_M.gguf` | `/props`           |
| 1 リクエスト ctx | **32768**                                         | `/props`, `/slots` |
| スロット数       | 4（各スロット `n_ctx` 32768）                     | `/slots`           |
| 学習時 ctx       | **262144**（`n_ctx_train`）                       | `/v1/models`       |
| モデルサイズ     | 21,158,128,128 bytes（約 19.7 GiB）               | `/v1/models`       |

学習時の 1/8 しか使えていない。**目標は 1 リクエストあたりの ctx を 262144 に可能な限り近づけること。**

再取得は Windows 側から次で行える。

```bash
curl -s http://avalon:8080/props   | python -c "import sys,json;d=json.load(sys.stdin);print(d['default_generation_settings']['n_ctx'], d['total_slots'], d['build_info'])"
curl -s http://avalon:8080/v1/models | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['meta'])"
```

## 2. 方針と許容するトレードオフ

| 手段                            | 効果                                         | 代償                       | 採否       |
| ------------------------------- | -------------------------------------------- | -------------------------- | ---------- |
| `-np 1`（スロット 1 本）        | 同じメモリで 1 リクエストの ctx が最大化     | 並列リクエストは順番待ち   | 採用       |
| KV キャッシュ q8_0 + flash attn | KV メモリがおよそ半分 → 同じ VRAM で倍の ctx | ごく小さい品質劣化         | 採用       |
| `--n-cpu-moe`                   | この機体では効果なし（実測。§2 末尾を参照）  | —                          | **不採用** |
| `--no-kv-offload`               | KV を丸ごと RAM へ                           | プロンプト処理まで大幅低速 | 不採用     |

> **APU での注意（2026-09-21 追記）**: 実機は AMD Cezanne iGPU で、VRAM（UMA 3 GiB）も GTT も CPU RAM も
> **同一の物理メモリ** である。したがって `--n-cpu-moe` に「VRAM を空けて RAM へ逃がす」という意味はない。
> 総フットプリントは変わらず、減るのは GPU 割当（GTT 使用量）だけで、代償は生成速度。
> 実効的な上限は **GTT の 29.88 GiB** である。
>
> **実測で決着（2026-09-21）**: `--n-cpu-moe 0`（全層 GPU）と `4` を比較したところ、
> GTT は 21.2 対 21.58 GiB、生成は 15.36 対 15 tok/s、プロンプト処理は 93.4 対 97 tok/s で
> **いずれも差が無かった**。配置を変えても読み出す物理メモリと帯域（51.2 GB/s）が同じだからである。
> 起動ログは `load_tensors: offloaded 41/41 layers to GPU`（全 41 層）。
> **このフラグは本機体では外してよい。**

`-np 1` にしてよい根拠: `.config/chatlog-exporter/config.yaml` を `concurrency: 1` にしたため
（`cle-kju.4`）。クライアントは同時に 1 リクエストしか投げない。

> **訂正（2026-09-21）**: 本節は当初「`config.yaml` は `concurrency: 1`」と書いていたが、
> 実値は `concurrency: 4` だった。スロット 1 本に 4 リクエストが並ぶと最後の 1 本は 4 倍待ち、
> setfm meta（70.1s 実測）で 280s となり `timeoutMs` 300s に肉薄する。`cle-kju.4` で 1 に変更済み。

## 3. Phase A — 現状把握（avalon 上で実行）

### 3.1 実際の起動コマンドと起動スクリプト

```bash
pgrep -af llama-server
tr '\0' '\n' < /proc/$(pgrep -n llama-server)/cmdline   # フラグを 1 行ずつ
ls -l /proc/$(pgrep -n llama-server)/cwd                # 起動スクリプトの置き場所の手がかり
```

**ここで必ず確定させること**: `-c` の値が `131072`（総量。4 分割されて 32768/slot）なのか
`32768`（`--kv-unified` 等でスロット共有）なのか。
前者なら `-np 1` にするだけで KV を増やさずに 131072 まで伸びる。

### 3.2 ハードウェア

実機の GPU は **AMD Cezanne iGPU** であり、NVIDIA 用の `nvidia-smi` を使えない。

```bash
# ビルドが GPU を見えているか（Vulkan / ROCm の有無がここで分かる）
/opt/bin/llama/llama-server --list-devices

# VRAM（UMA 固定確保）と GTT（システム RAM から動的確保）
cat /sys/class/drm/card1/device/mem_info_vram_total
cat /sys/class/drm/card1/device/mem_info_vram_used
cat /sys/class/drm/card1/device/mem_info_gtt_total
cat /sys/class/drm/card1/device/mem_info_gtt_used
free -g
```

`card1` は amdgpu の DRM デバイス。`card0` は simpledrm でレンダーノードを持たない。
対応関係は `readlink -f /sys/class/drm/renderD128/device` と
`readlink -f /sys/class/drm/card1/device` が同じ PCI パスを指すことで確認できる。

**`ps` の RSS は当てにならない。** 重みは GPU バッファに載るとプロセスの RSS に計上されない
（実測: RSS 205 MiB に対し GPU 側 19.74 GiB）。GPU 利用の有無は必ず `mem_info_*_used` で見る。

**読むタイミングに注意。** サーバ再起動直後のモデル読込前に読むと `gtt_used` がほぼ 0 になり、
CPU 実行と誤認する。`pgrep -af llama-server` で PID を確認し、同じ PID の状態を見ること。

### 3.3 KV サイズの実測（外挿の基準値）

起動ログから次の行を控える。ログの出力先が不明なら、いったん停止して
`llama-server ... 2>&1 | tee /tmp/llama-boot.log` で取り直す。

```bash
journalctl -t llama-server -n 300 --no-pager | grep -Ei 'n_ctx|KV self|offloaded|flash'
# 見る行:
#   llama_context: n_ctx_per_seq = ...
#   llama_kv_cache: ... KV self size  = ... MiB, K (f16): ... MiB, V (f16): ... MiB
#   load_tensors: offloaded NN/NN layers to GPU
```

トークンあたりの KV バイト数を出す。**層数を推測しない。必ずこの実測値から線形外挿する。**

```text
KV_per_token = KV_self_size_MiB / n_ctx_per_seq / n_parallel   (MiB/token)
必要 KV(f16)  = KV_per_token × 目標 ctx
必要 KV(q8_0) ≈ 上記 × 0.5      ... f16 16bit → q8_0 8bit 相当
空き VRAM     = memory.total − （モデル重みのうち GPU に載る分） − 1〜2 GiB の余裕
```

### 3.4 サブコマンドの有無を確認

ビルドによってフラグ名が違う。`--help` で実在を確認してから使う。

```bash
llama-server --help | grep -E -- '--flash-attn|--cache-type-k|--cache-type-v|--n-cpu-moe|--parallel|--ctx-size'
```

- `-fa` が値を取らない古い形式なら `-fa on` ではなく `-fa` と書く
- `--n-cpu-moe` が無いビルドなら `--override-tensor 'ffn_.*_exps=CPU'`（全エキスパートを CPU）で代用する

## 4. Phase B — 起動オプションの変更

起動スクリプトを編集する。**追加・変更するフラグ**:

| フラグ                    | 値       | 意図                                                            |
| ------------------------- | -------- | --------------------------------------------------------------- |
| `-c` / `--ctx-size`       | `262144` | `n_ctx_train` の上限。これ以上は RoPE 拡張が必要なので張らない  |
| `-np` / `--parallel`      | `1`      | ctx をスロットで分割させない                                    |
| `-fa` / `--flash-attn`    | `on`     | KV 量子化の前提                                                 |
| `-ctk` / `--cache-type-k` | `q8_0`   | K キャッシュを 8bit に                                          |
| `-ctv` / `--cache-type-v` | `q8_0`   | V キャッシュを 8bit に                                          |
| `--n-cpu-moe`             | `<N>`    | 先頭 N 層の MoE エキスパートを CPU へ。空いた VRAM を KV に回す |

**落としてはいけない既存フラグ**:

- **thinking を無効にする指定**（外すと構造化出力の実測結果が無効になる）。
  `docs/.deckrd/libs/ai-backend/measurements-response-format-2026-09-12.md` §1 は
  `--chat-template-kwargs '{"enable_thinking":false}'` を「必須の起動オプション」として記録しているが、
  **build `b10688` はこれを deprecated とし、起動時に次の警告を出す。**

  ```text
  W Setting 'enable_thinking' via --chat-template-kwargs is deprecated. Use --reasoning on / --reasoning off instead.
  ```

  本手順では意味の等価な `--reasoning off` へ置き換える。置き換え後は
  `/props` の `reasoning_format` が `none`、`chat_format` が `Content-only` のままであることを
  §5.1 で確認する（ここが変わると測定レポートの前提が崩れるため、変わっていたら
  `--chat-template-kwargs` 形式へ戻して別途測定し直す）。
- `-m`（モデルパス）、`--host` / `--port 8080`、vision 用の `--mmproj`（付いていれば）

書き換え後の形（既存フラグは Phase A 3.1 の実測に合わせる）:

```bash
llama-server \
  -m /mnt/exdisk/llm/hub/models--lmstudio-community--Qwen3.5-35B-A3B-GGUF/snapshots/*/Qwen3.5-35B-A3B-Q4_K_M.gguf \
  --host 0.0.0.0 --port 8080 \
  -c 262144 \
  -np 1 \
  -fa on \
  -ctk q8_0 -ctv q8_0 \
  --n-cpu-moe 12 \
  --reasoning off
```

### 4.1 入らなかったときの降順ラダー

起動が OOM で落ちる、または `offloaded` 層数が減って生成が極端に遅くなったら、上から順に 1 段下げる。

1. `-c 262144` のまま `--n-cpu-moe` を増やす（VRAM をエキスパートから KV へ寄せる）
2. `-c 196608`
3. `-c 131072`
4. `-c 65536`（それでも現状の 2 倍）

各段で §3.3 の `KV self size` を見て、外挿が合っているかを確認する。

## 5. Phase C — 検証

### 5.1 設定が効いているか（Windows 側から）

```bash
curl -s http://avalon:8080/props | python -c "import sys,json;d=json.load(sys.stdin);p=d['default_generation_settings']['params'];print('n_ctx=',d['default_generation_settings']['n_ctx'],'slots=',d['total_slots'],'chat_format=',p['chat_format'],'reasoning_format=',p['reasoning_format'])"
# 期待: n_ctx = 設定値 / slots = 1 / chat_format = Content-only / reasoning_format = none
```

後ろ 2 つは `--reasoning off` が `--chat-template-kwargs '{"enable_thinking":false}'` と
等価に効いているかの確認（§4 参照）。違っていたら構造化出力の測定前提が崩れている。

### 5.2 GPU メモリの余裕（avalon 側、生成中に観測）

```bash
watch -n 2 'grep . /sys/class/drm/card1/device/mem_info_{vram,gtt}_{used,total}'
```

見るべき天井は **GTT の 29.88 GiB**。VRAM 3 GiB は先に埋まりきる（実測 96%）ので余裕の指標にならない。
GTT が上限に近づいたら `--n-cpu-moe` を増やすか `-c` を下げる（§4.1 の降順ラダー）。

### 5.3 実入力での往復

32768 を明確に超える長さのチャットログ 1 本を `/v1/chat/completions` に投げ、次を確認する。

- HTTP 200 で `choices[0].finish_reason` が `stop`
- 途中で `context shift` / `n_past` 切り詰めのログが出ていない
- 生成中に `curl -s http://avalon:8080/slots` の `n_past` が 32768 を超えて進む

### 5.4 chatlog-exporter から通す

`.config/chatlog-exporter/config.yaml` の `model` に `"llama/avalon"` を設定し（現在は未設定）、
`/normalize-chatlogs` を 1 件だけ実行する。`concurrency: 1` は維持すること
（スロットが 1 本になったため、2 以上にすると待ちが発生する）。

## 6. Phase D — 記録とフォローアップ

- §7 の記入欄を埋め、`bd note cle-kju` に最終的な起動コマンドを残す
  （チャットに書くだけでは次セッションに残らない）
- 別 issue に切る。今回は触らない:
  - `timeoutMs: 300_000` — 超長プロンプトのプロンプト処理が 5 分を超える可能性がある
  - `maxContentLength: 4000` / `chunkSize: 2` — サーバの ctx が伸びても、クライアントが
    4000 文字で切っている限り入力は長くならない。ctx 拡張の効果を実測してから決める

## 7. 適用結果と残りの記入欄

### 7.1 適用後の起動コマンド（avalon: `~/bin/avalon-llama.sh`）

```bash
/opt/bin/llama/llama-server   -hf lmstudio-community/Qwen3.5-35B-A3B-GGUF:Q4_K_M   -ngl 99   --ctx-size 262144   --parallel 1   -fa on   -ctk q8_0 -ctv q8_0   --n-cpu-moe 4   --host 0.0.0.0 --port 8080   --chat-template-kwargs '{"enable_thinking":false}'
```

モデルは `-m <path>` ではなく `-hf` 指定。`mmproj-Qwen3.5-35B-A3B-BF16.gguf` が併せて読み込まれ、
マルチモーダルとして起動する。

> **乖離と解消（2026-09-21）**: 一時、稼働中のプロセスが上記と違う状態になっていた。
>
> ```text
> --ctx-size 128000  --parallel 指定なし  --n-cpu-moe 4  -ngl 99  --reasoning off
> ```
>
> - `--parallel 1` が落ち、**スロット 4 本**。`/slots` は 4 本すべて `n_ctx=128000`
> - このビルドの `--ctx-size` は **スロットあたり**。KV 総確保は 4 × 128,000 = **512,000 トークン**
> - クライアントは `concurrency: 1`（`cle-kju.4`）なので 3 本分の KV が無駄になっていた
>
> **原因はスクリプトではなく古い起動プロセスだった。** `~/bin/avalon-llama.sh` の中身は
> `--parallel 1` / `--ctx-size 262144` を含んでおり正しい。再起動で解消済み。
>
> ```bash
> kill <pid>
> ~/bin/avalon-llama.sh 2>&1 | tee ~/temp/llama-boot.log
> ```
>
> 再起動後の起動ログ: `srv load_model: initializing, n_slots = 1, n_ctx_slot = 262144, kv_unified = 'false'`

### 7.2 検証結果（2026-09-21、Windows 側から HTTP で実測）

| 項目                     | 変更前           | 変更後       | 取得元             |
| ------------------------ | ---------------- | ------------ | ------------------ |
| 1 リクエスト ctx         | 32768            | **262144**   | `/props`, `/slots` |
| スロット数               | 4                | **1**        | `/props`, `/slots` |
| `n_ctx_slot`（起動ログ） | —                | 262144       | `srv load_model`   |
| `kv_unified`             | —                | false        | `srv load_model`   |
| `chat_format`            | Content-only     | Content-only | `/props`           |
| `reasoning_format`       | none             | none         | `/props`           |
| build                    | b10688-c589f0ed1 | 同じ         | `/props`           |

上表は Phase B 直後の値。一時 `--parallel 1` が失われていたが、再起動で復旧済み（§7.1）。

| 項目             | Phase B 直後 | 乖離時（一時） | 再起動後（現行） | 取得元             |
| ---------------- | ------------ | -------------- | ---------------- | ------------------ |
| 1 リクエスト ctx | 262144       | 128000         | **262144**       | `/props`, `/slots` |
| スロット数       | 1            | 4              | **1**            | `/props`, `/slots` |
| KV 総確保        | 262,144 tok  | 512,000 tok    | **262,144 tok**  | 上 2 行から算出    |

学習時上限 `n_ctx_train = 262144` に到達しており、**RoPE 拡張なしで伸ばせる上限**。
`chat_format` / `reasoning_format` が変わっていないため、
`measurements-response-format-2026-09-12.md` の構造化出力の測定結果はそのまま有効。

### 7.3 実測値（2026-09-21、avalon 上で取得）

**GPU は使用されている。** モデルと KV 合わせて 24.52 GiB が VRAM + GTT に載っている。

| 項目                    | 値                                                                       |
| ----------------------- | ------------------------------------------------------------------------ |
| GPU                     | AMD Cezanne iGPU / Vulkan `RADV RENOIR` / ヒープ 33,671 MiB（32.88 GiB） |
| VRAM（UMA）使用 / 総量  | **2.94 / 3.0 GiB（98%）**。先に飽和するため余裕の指標にならない          |
| GTT 使用 / 総量         | **21.58 / 29.88 GiB（72%）**。残り **8.30 GiB**                          |
| GPU 合計使用            | **24.52 / 32.88 GiB**                                                    |
| プロセス RSS / VSZ      | 205 MiB / 20.4 GiB（重みは GPU バッファのため RSS に出ない）             |
| プロンプト処理 / 生成   | 97 tok/s / 15 tok/s（`measurements-response-format-2026-09-12.md` §3.5） |
| `KV self size`          | 未取得。本ビルドは既定で静かで当該行を出さない（`-v` が要る）            |
| `offloaded` 層数        | **41/41 layers to GPU**（`-v` 付き起動で取得）                           |
| 262144 超の実入力の往復 | 未実施                                                                   |

上表は `--parallel 1` / `--ctx-size 262144` / `--n-cpu-moe 4` での値。
乖離時（4 スロット × 128,000）の GTT は 16.87 GiB だった。KV のトークン数は半減したのに
GPU 使用量が増えたのは、`kv_unified = false` の単一スロットが 262,144 トークン分を
先に確保するためと見られる。

ホスト側の構成も併せて記録する。

| 項目           | 値                                                               |
| -------------- | ---------------------------------------------------------------- |
| avalon の実体  | PVE 上の **unprivileged LXC**（vmid 100）。VM ではない           |
| コンテナ割当   | `memory: 32768` / `swap: 4096` / `cores: 8`                      |
| GPU の渡し方   | `dev0: path=/dev/dri/renderD128,mode=0666`（レンダーノードのみ） |
| PVE ホスト物理 | RAM 64 GiB。うち 32 GiB を avalon に割当                         |
| モデル置き場   | `mp1` → `/mnt/exdisk/llm`（1T）。`rootfs` は 8G                  |

調整の指針は次のとおり。

- 天井は **GTT の 29.88 GiB**。VRAM 3 GiB は先に埋まりきるため指標として使えない
- `--n-cpu-moe` は **外す**。0 と 4 で GTT・速度とも差が無いことを実測済み（§2）
- ホストの `amdgpu.gttsize` 拡張やコンテナ `memory` の増量は、この余裕がある限り不要
- 次の再起動時は `2>&1 | tee /tmp/llama-boot.log` を付け、`KV self size` と
  `load_tensors: offloaded NN/NN layers to GPU` を残すこと（上表の空欄が埋まる）

取得コマンドは §3.2 / §3.3 / §5.2 / §5.3 を参照。降順ラダー（§4.1）は今回使っていない。

### 7.4 残っている懸念

- ~~`--chat-template-kwargs` が deprecated~~ → **解消**。稼働中のコマンドは `--reasoning off` に
  置換済みで、`/props` は `chat_format = Content-only` / `reasoning_format = none` のまま。
  構造化出力の測定前提は維持されている（§5.1 の確認条件を満たす）
- ~~超長プロンプトが `timeoutMs: 300_000` を超える可能性~~ → **実害を確認、`cle-kju.5` で対応中**。
  normalize-chatlogs は入力を truncate せず `BATCH_SIZE = 4` もハードコード。実測分布の p90
  （4 件で約 131,000 字 ≈ 50,000 トークン）でプロンプト処理だけで 515 秒となり、timeout の約 2 倍。
  **`--single-file` は `BATCH_SIZE` を 1 に落とすため §5.4 の検証手順では検出できない。**
  検証は必ず 4 件以上のバッチ実行で行うこと
- `--parallel 1` が起動スクリプトから失われている（§7.1 の乖離）。`cle-kju.7` で追跡
