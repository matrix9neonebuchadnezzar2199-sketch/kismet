https://www.kismetwireless.net

## Quick install from GitHub (this fork)

`git pull` alone updates only the clone; **run `sudo make install` after building** so the web UI under `PREFIX/share/kismet/httpd/` (often `/usr/local/share/kismet/httpd/`) matches the repo.

**Kali / Debian / Ubuntu (first time or after deps missing):**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/matrix9neonebuchadnezzar2199-sketch/kismet/master/scripts/install-from-github.sh) --with-deps
```

**Already have build tools:** clone/update + build + install (default directory: `~/kismet-enhanced/kismet`):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/matrix9neonebuchadnezzar2199-sketch/kismet/master/scripts/install-from-github.sh)
```

**From a local clone:** `./scripts/install-from-github.sh` or `./scripts/install-from-github.sh /path/to/kismet --with-deps`

**Environment:** `KISMET_GIT_URL` to use another remote, `KISMET_PREFIX` for `./configure --prefix` (default `/usr/local`).

---

### 日本語（GitHub から入れる）

- **ソースを更新しただけでは Web の表示は変わりません。**`make` のあと **`sudo make install`** まで行い、Kismet を再起動してください（配信されるのは `PREFIX/share/kismet/httpd/` 配下です）。
- 上記のワンライナーは **clone / `git pull` → `./configure` → `make` → `sudo make install`** まで実行します。初回やビルド失敗時は `--with-deps` で apt の依存を入れてください。

---

The Kismet docs can be most easily found and read at [the Kismet website](https://www.kismetwireless.net/docs/readme/intro/kismet/)


The docs repository is at:

```bash
$ git clone https://www.kismetwireless.net/git/kismet-docs.git
```

and mirrored on Github at:

```bash
$ git clone https://www.github.com/kismetwireless/kismet-docs
```

