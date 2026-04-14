# Kismet（拡張 UI フォーク）

[Kismet](https://www.kismetwireless.net) 本体に、**Web UI（`http_data/`）の拡張**（デバイス一覧からのホワイトリスト操作・未接続クライアント周りの改善・多言語など）を載せたフォークです。ビルド手順はアップストリームと同じですが、**インストール後にブラウザで見える画面は、このリポジトリの `http_data` が反映されるように**運用してください。

公式ドキュメント: [Kismet docs](https://www.kismetwireless.net/docs/readme/intro/kismet/)

---

## 日本語（初心者向け）

### 事前に知っておくこと（3 行）

1. **GitHub で「コードを見る」と Web 画面はまだ変わりません。** 手元の PC に clone して **ビルド・インストール**するか、少なくとも **clone したフォルダをカレントにして** Kismet を起動します。  
2. **`git pull` だけ**では、多くの環境では **まだ古い画面のまま**です。更新後は **`make` と `sudo make install`**（または下記の「clone 直下で起動」）まで行ってください。  
3. 無線キャプチャには **対応ドライバと権限**（例: Kali では `sudo` やグループ設定）が必要です。ここでは **UI を最新にする手順**を中心に書きます。

---

### 初回にやること（まっさらな Kali / Debian / Ubuntu 向け）

**目標:** 依存パッケージを入れる → ソースを取得する → コンパイルする → システムにインストールする → Kismet を起動する。

#### A. いちばん簡単（おすすめ・ワンライナー）

ターミナルを開き、次を **そのまま 1 回**実行します（`sudo` でパスワードを聞かれます）。

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/matrix9neonebuchadnezzar2199-sketch/kismet/master/scripts/install-from-github.sh) --with-deps
```

- **何が起きるか:** `apt` でビルド依存を入れます → 既定では **`$HOME/kismet-enhanced/kismet`** に clone（または更新）→ `./configure` → `make` → **`sudo make install`** まで実行します。  
- **終わったら:** 下の「**初回の Kismet の起動方**」に進んでください。

#### B. 手元ですべて打つ場合（ワンライナーを使わない）

すでに `git` やビルドツールに慣れている人向けの例です。

```bash
# 1) 置き場所を作って clone（URL はこのリポジトリ）
mkdir -p "$HOME/kismet-enhanced"
git clone https://github.com/matrix9neonebuchadnezzar2199-sketch/kismet.git "$HOME/kismet-enhanced/kismet"
cd "$HOME/kismet-enhanced/kismet"

# 2) 初回だけ依存関係（Debian 系の例。失敗したらワンライナーの --with-deps を使う）
sudo apt-get update
sudo apt-get install -y build-essential git pkg-config \
  libwebsockets-dev zlib1g-dev libnl-3-dev libnl-genl-3-dev libcap-dev \
  libpcap-dev libnm-dev libdw-dev libsqlite3-dev \
  libprotobuf-dev protobuf-compiler libprotobuf-c-dev protobuf-c-compiler \
  libsensors-dev libusb-1.0-0-dev libbluetooth-dev libcurl4-openssl-dev libssl-dev \
  libpcre3-dev python3 python3-dev python3-setuptools librtlsdr-dev libmosquitto-dev \
  flex bison

# 3) 設定・ビルド・インストール（PREFIX は環境に合わせてよい）
./configure --prefix=/usr/local
make -j"$(nproc)"
sudo make install
```

---

### 初回の Kismet の起動方（UI をこのリポジトリのものにしたいとき）

**おすすめ:** インストール後も、**clone したディレクトリに `cd` してから** `kismet` を起動してください。

```bash
cd "$HOME/kismet-enhanced/kismet"
sudo kismet
```

- このフォークの本体では、**カレントディレクトリに `http_data/index.html` があると、その UI を優先**します（パッケージに入っている古い `httpd` より先）。起動ログに **`http_data next to working directory`** や **`takes precedence`** と出ていれば、そのモードです。  
- ブラウザは **強制再読み込み**（キャッシュ無効）を推奨します。

**注意:** `sudo` だけ実行して **カレントが `/root` など**だと、上の「優先」に引っかからないことがあります。そのときは **`cd` してから `sudo kismet`** にするか、`sudo sh -c 'cd /home/あなたのユーザー/kismet-enhanced/kismet && kismet'` のように **作業ディレクトリを clone 側に合わせて**ください。

---

### 2 回目以降にやること（ソースを更新したあと）

**目標:** 最新の `master` を取り込む → 再ビルド → 再インストール → Kismet を再起動する。

#### パターン 1: ワンライナーで更新（初回と同じスクリプト・依存は入れない）

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/matrix9neonebuchadnezzar2199-sketch/kismet/master/scripts/install-from-github.sh)
```

- 既存の **`$HOME/kismet-enhanced/kismet`** を `git pull` してから `make` / `sudo make install` します。

#### パターン 2: すでに clone がある場合（手動）

```bash
cd "$HOME/kismet-enhanced/kismet"
git pull origin master
make -j"$(nproc)"
sudo make install
```

その後、**Kismet をいったん止めてから**もう一度起動します。ブラウザは **強制再読み込み**。

- `./configure` をやり直したいとき（オプション変更など）は、リポジトリ内で  
  `./scripts/install-from-github.sh "$HOME/kismet-enhanced/kismet" --reconfigure`  
  または `make distclean` のあと `./configure` からやり直してください。

---

### Web UI が期待どおりに変わらないとき

| 確認すること | 内容 |
|--------------|------|
| **起動ディレクトリ** | 拡張 UI を優先したいなら **clone の直下**（`http_data` がある場所）で起動。 |
| **インストール** | システム全体の UI を更新したいなら、更新のたびに **`sudo make install`** まで行う。 |
| **ログ** | 起動ログの **`Serving static file content from ...`** で、実際に読んでいるフォルダを確認。 |
| **明示設定** | どうしても固定したい場合は `~/.kismet/kismet_site.conf` に `httpd_home=/cloneのパス/http_data/`（末尾 `/` 推奨）。 |
| **環境変数** | 上級者向け: 設定パスに `index.html` が無い場合のフォールバックとして **`KISMET_HTTP_DATA`**（`http_data` の絶対パス）を使えます。 |

---

### スクリプト・環境変数（上級者向け）

- **ローカル clone から:** `./scripts/install-from-github.sh` または `./scripts/install-from-github.sh /path/to/kismet --with-deps`  
- **`KISMET_GIT_URL`:** 別の Git リモートを指定  
- **`KISMET_PREFIX`:** `./configure --prefix`（既定 `/usr/local`）

---

## English (short)

This fork adds an enhanced **web UI** under `http_data/` (whitelist from the device list, unassociated clients UX, i18n, etc.).

- **First time (Debian/Ubuntu/Kali):**  
  `bash <(curl -fsSL https://raw.githubusercontent.com/matrix9neonebuchadnezzar2199-sketch/kismet/master/scripts/install-from-github.sh) --with-deps`
- **Later updates:** same script without `--with-deps`, or `cd` your clone → `git pull` → `make` → `sudo make install` → restart Kismet.
- **UI path:** If you start `kismet` with the **clone root as the current working directory** and `http_data/index.html` exists there, that tree is preferred over the packaged `httpd_home`. Otherwise rely on `sudo make install` or set `httpd_home` in `~/.kismet/kismet_site.conf`.

Upstream docs: [kismetwireless.net](https://www.kismetwireless.net/docs/readme/intro/kismet/)

Docs git (official):

```bash
git clone https://www.kismetwireless.net/git/kismet-docs.git
```

Mirror on GitHub:

```bash
git clone https://www.github.com/kismetwireless/kismet-docs
```
