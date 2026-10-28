# Diagnosis: https://week8.test did not load

Checked on 26 Oct 2026, Docker Desktop 29.8.1, from `scaffolds/week-8-demo`. The browser could not open `https://week8.test`. `http://localhost:3010/health` already returned `{"ok":true}`.

The certificate files were mounted. Caddy was running, and its logs said it was serving `week8.test`. The container had no Docker network, so Docker never opened ports 80 and 443 on the Mac, and Caddy could not reach the `app` service.

`compose.yml` did not need a change. The container had been created four days earlier and started again this morning. Compose treated that container as current and left the broken attachment in place.

## 1. Confirm the name and the app

```sh
grep 'week8.test' /etc/hosts
curl -fsS http://127.0.0.1:3010/health
curl -sv --max-time 5 https://week8.test/health
```

This machine had both hosts lines:

```text
127.0.0.1 week8.test
::1 week8.test
```

The app answered `{"ok":true}`. `https://week8.test` failed immediately:

```text
connect to 127.0.0.1 port 443 from 127.0.0.1 port 54898 failed: Connection refused
connect to ::1 port 443 from ::1 port 54899 failed: Connection refused
```

Connection refused means nothing on this Mac is listening. A certificate problem shows up later, after the TCP connection succeeds, as a warning in the browser or a TLS error from curl.

On Windows, use `curl.exe` and check `C:\Windows\System32\drivers\etc\hosts`.

## 2. Check the certificate mount

The earlier pass stopped at “the certs folder is not bound.” Check that before looking at the network. A missing mount is a real failure mode for this stack: `Caddyfile` reads `/certs/week8.test.pem` and `/certs/week8.test-key.pem`, and those files exist only because `compose.yml` bind-mounts `./certs`.

On the host:

```sh
ls -la certs
```

Expected names: `week8.test.pem` and `week8.test-key.pem`. Both were present here (`chmod 644`, dated 21 Oct).

In the container:

```sh
docker inspect week-8-demo-caddy-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
docker compose exec caddy ls -la /certs
```

A missing mount has no line ending in `-> /certs`. `ls /certs` then reports that the directory does not exist, or it is empty. Caddy’s log then fails while loading the certificate and the container exits.

This run had the mount:

```text
/host_mnt/Users/jeremiah/Sites/ISIT-300---Web-Technologies-Course/scaffolds/week-8-demo/certs -> /certs
```

`/certs` inside the container contained both pem files. Caddy’s log included:

```text
using config from file  file=/etc/caddy/Caddyfile
skipping automatic certificate management because one or more matching certificates are already loaded  domain=week8.test
serving initial configuration
```

Stop this check once those two files are visible in the container and that log line is present. The mount is doing its job.

## 3. See whether ports 80 and 443 are published

`compose.yml` asks for `"80:80"` and `"443:443"`. The running container can still fail to publish them.

```sh
docker compose ps
docker port week-8-demo-caddy-1
docker inspect week-8-demo-caddy-1 --format 'Bindings={{json .HostConfig.PortBindings}} Ports={{json .NetworkSettings.Ports}}'
lsof -nP -iTCP:80 -sTCP:LISTEN
lsof -nP -iTCP:443 -sTCP:LISTEN
```

Broken output from this machine:

```text
week-8-demo-caddy-1   Up   80/tcp, 443/tcp
```

`docker port` printed nothing. `lsof` printed nothing. Inspect showed the mismatch:

```text
Bindings={"443/tcp":[{"HostIp":"","HostPort":"443"}],"80/tcp":[{"HostIp":"","HostPort":"80"}]}
Ports={"443/tcp":[],"80/tcp":[]}
```

`HostConfig.PortBindings` is what Compose requested. `NetworkSettings.Ports` is what Docker actually opened. Empty arrays mean the host ports were never opened. `docker compose ps` prints `80/tcp, 443/tcp` in that state. A published container prints `0.0.0.0:80->80/tcp` and `0.0.0.0:443->443/tcp`.

On Windows, `netstat -ano | findstr ":443 "` replaces the `lsof` lines.

## 4. See whether Caddy is on the Compose network

Port publishing and service DNS come from the same network endpoint. Check it next.

```sh
docker inspect week-8-demo-caddy-1 --format '{{json .NetworkSettings.Networks}}'
docker network inspect week-8-demo_default --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
docker compose exec caddy wget -qO- http://app:3000/health
```

Broken output:

```text
{}
week-8-demo-app-1 192.168.32.2/20
wget: bad address 'app:3000'
```

`{}` means the Caddy container had no network. Only `week-8-demo-app-1` was attached to `week-8-demo_default`, so the name `app` did not resolve. The app container’s own publish of `3010` still worked, which is why `http://localhost:3010/health` succeeded while `https://week8.test` did not.

The container’s create time was four days earlier. Its start time was this morning (`2026-10-26T17:08:36Z`), and `RestartCount` was 0. Docker started the old container again. It did not create a new one, and the new start came up with no endpoint.

## 5. Recreate the Caddy container

`docker compose up` and `docker compose start` keep this container. The Compose file matches the container spec, so Compose does not rebuild it, and the empty network stays.

```sh
docker compose up -d --force-recreate --no-deps caddy
```

`--no-deps` leaves the app container running. `--force-recreate` deletes the Caddy container and creates one that joins `week-8-demo_default` and publishes 80 and 443.

After that command, this machine showed:

```text
80/tcp -> 0.0.0.0:80
80/tcp -> [::]:80
443/tcp -> 0.0.0.0:443
443/tcp -> [::]:443
week-8-demo_default 192.168.32.3
```

## 6. Prove the site before opening a browser

```sh
curl -fsS -D - https://week8.test/health
curl -fsS -D - -o /dev/null http://week8.test/health
curl -fsS -o /dev/null -w 'https_home:%{http_code}\n' https://week8.test/
```

Results after the recreate:

```text
HTTP/2 200
via: 1.1 Caddy
{"ok":true}

HTTP/1.1 308 Permanent Redirect
Location: https://week8.test/health

https_home:200
```

`curl` completed without `-k`, so the mkcert certificate verified. The browser then loaded `https://week8.test/` with the title `ISIT 300 Baseline` and the line “If you can read this through Caddy HTTPS, your baseline is working.”

On Windows, call `curl.exe` with the same flags.

## What to tell the class

Walk the checks in this order. Stop at the first one that fails.

| Check | Command | Healthy result | Failure and correction |
| --- | --- | --- | --- |
| Hosts | `grep week8.test /etc/hosts` | `127.0.0.1` and `::1` | Add both lines. See `instructions.md` step 3. |
| App | `curl -fsS http://127.0.0.1:3010/health` | `{"ok":true}` | The Bun service is down. Read `docker compose logs app`. |
| Cert files on the host | `ls certs` | both `week8.test*.pem` files | Run `instructions.md` step 4. |
| Cert mount | `docker compose exec caddy ls /certs` | both pem files | `./certs:/certs:ro` is missing or the container predates it. Recreate Caddy after the volume line is in `compose.yml`. |
| Published ports | `docker port week-8-demo-caddy-1` | `0.0.0.0:80` and `0.0.0.0:443` | Bindings with empty `Ports` means the endpoint is gone. |
| Compose network | `docker inspect` `NetworkSettings.Networks` | `week-8-demo_default` and an IP | `{}` is this incident. Recreate Caddy. |
| Site | `curl -fsS https://week8.test/health` | `{"ok":true}` via Caddy | Then open `https://week8.test` in Firefox. |

The correction for this incident is one command:

```sh
docker compose up -d --force-recreate --no-deps caddy
```
