# Set up the Week 8 demo

Firefox has to be installed. Docker Desktop has to be running. Nothing else can be bound to ports 80 or 443. On macOS, use Terminal. On Windows, use PowerShell. Start in `scaffolds/week-8-demo`.

## 1. Install mkcert

`mkcert` issues a local certificate for `week8.test`.

### macOS

```sh
brew install mkcert nss
```

`nss` provides `certutil`, which is how that certificate gets into Firefox. Firefox keeps its own certificate store, separate from the macOS keychain.

### Windows

```powershell
winget install -e --id FiloSottile.mkcert
```

Close that terminal and open a new one so `mkcert` is on `PATH`. winget installs the portable `mkcert` command. It does not run `mkcert -install` for you. That is step 2.

Chocolatey (`choco install mkcert`) and Scoop (`scoop bucket add extras`, then `scoop install mkcert`) install the same program if winget is unavailable.

## 2. Trust the mkcert CA

Leave this CA in place. Later runs reuse it, so the certificate you are about to make stays valid.

### macOS

```sh
mkcert -install
```

Approve the macOS password prompt. This puts the mkcert root in the System keychain.

### Windows

Open PowerShell as Administrator if Windows denies the change.

```powershell
mkcert -install
```

This puts the mkcert root in the Windows trust store. Chrome and Edge trust it. Firefox does not yet. That is step 5.

## 3. Make `week8.test` resolve

`.test` is not a public DNS name. The hosts file on this machine has to send `week8.test` to `127.0.0.1` and `::1`.

### macOS

```sh
grep 'week8.test' /etc/hosts || printf '%s\n' '127.0.0.1 week8.test' '::1 week8.test' | sudo tee -a /etc/hosts
dscacheutil -q host -a name week8.test
```

The check should print `127.0.0.1` and `::1`.

### Windows

Open PowerShell as Administrator. The hosts file is `C:\Windows\System32\drivers\etc\hosts`, and Windows only lets an elevated process write it.

```powershell
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
if (-not (Select-String -Path $hostsPath -Pattern '(^|\s)week8\.test(\s|$)' -Quiet)) {
  Add-Content -Path $hostsPath -Value "127.0.0.1 week8.test"
  Add-Content -Path $hostsPath -Value "::1 week8.test"
}
ping -4 -n 1 week8.test
ping -6 -n 1 week8.test
```

Each ping should report `127.0.0.1` or `::1`. If a terminal still resolves the name somewhere else, run `ipconfig /flushdns` and ping again.

## 4. Issue the certificate Caddy will serve

`certs/week8.test.pem` is the certificate. `certs/week8.test-key.pem` is its private key. Both names are what `Caddyfile` mounts. These files stay on this machine. They are gitignored.

### macOS

```sh
mkdir -p certs
mkcert -cert-file certs/week8.test.pem -key-file certs/week8.test-key.pem week8.test
chmod 644 certs/week8.test.pem certs/week8.test-key.pem
```

`chmod` lets the Caddy process read the key.

### Windows

Run this from `scaffolds\week-8-demo` in a normal PowerShell window. `mkcert` has to already be on `PATH` from step 1.

```powershell
New-Item -ItemType Directory -Force -Path certs
mkcert -cert-file certs/week8.test.pem -key-file certs/week8.test-key.pem week8.test
```

Windows has no `chmod`. Caddy runs as root inside the container and reads these files through the Docker mount.

## 5. Put that same CA into Firefox

Quit Firefox completely after this step and open it again. A window that is already open keeps the old certificate list.

### macOS

```sh
export PATH="$(brew --prefix nss)/bin:$PATH"
TRUST_STORES=nss mkcert -install
```

`nss` is keg-only, so `certutil` is not on your PATH until that `export`. `TRUST_STORES=nss` writes the CA into each Firefox profile.

### Windows

mkcert does not install its CA into Firefox on Windows. Firefox has to be told to use the Windows trust store from step 2.

1. Open Firefox and go to `about:config`.
2. Accept the warning.
3. Search for `security.enterprise_roots.enabled`.
4. Set it to `true`.
5. Quit Firefox, including the tray icon, and open it again.

## 6. Read the three lines Caddy is using

The `Caddyfile` is the same file on macOS and Windows:

```
week8.test {
	tls /certs/week8.test.pem /certs/week8.test-key.pem
	reverse_proxy app:3000
}
```

The site name is `week8.test`, so Caddy listens on 80 and 443 for that host. `tls` uses the two files from step 4. `reverse_proxy` sends the request to the `app` service on the Compose network, port 3000 inside the container.

## 7. Start the stack

`app` is Bun, published on the host as port 3010 so a class scaffold can keep port 3000. `caddy` publishes host ports 80 and 443. The first build installs Hono. Later starts reuse the image. Leave this terminal running.

### macOS

```sh
docker compose up --build
```

### Windows

From `scaffolds\week-8-demo` in PowerShell:

```powershell
docker compose up --build
```

Docker Desktop has to be running before this. If it reports that port 80 or 443 is already in use, stop the other listener and run the command again. IIS and the World Wide Web Publishing Service are the usual holders of those ports:

```powershell
netstat -ano | findstr ":80 "
netstat -ano | findstr ":443 "
```

## 8. Prove it before you open Firefox

Both results should print `{"ok":true}`. The first request went through Caddy and the mkcert certificate. The second one hit Bun directly.

### macOS

In a second terminal:

```sh
curl -fsS https://week8.test/health
curl -fsS http://localhost:3010/health
```

### Windows

In a second PowerShell window, call `curl.exe`. PowerShell aliases `curl` to `Invoke-WebRequest`, which does not take these flags.

```powershell
curl.exe -fsS https://week8.test/health
curl.exe -fsS http://localhost:3010/health
```

## 9. Open the demo

### macOS

Restart Firefox, then open:

- https://week8.test
- http://localhost:3010/health

### Windows

Quit Firefox from the menu, then start it again from the Start menu. Ending the window is not enough if Firefox stays in the notification area. Then open:

- https://week8.test
- http://localhost:3010/health

The lock icon should be trusted, and the page should say the baseline is working. If Firefox was open during step 5, the old process is still the one that refuses the certificate.
