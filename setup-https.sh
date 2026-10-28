#!/bin/sh
# Make https://week8.test resolve on this Mac and trusted in Firefox.
# Caddy's tls internal CA is not in Firefox's certificate store, and Firefox
# will not offer an exception for https://localhost. mkcert's CA is already
# in the macOS System keychain; this script also installs it into Firefox.
set -eu

cd "$(dirname "$0")"

if ! grep -Eq '(^|[[:space:]])week8\.test([[:space:]]|$)' /etc/hosts; then
  osascript <<'EOF'
do shell script "printf '%s\n' '127.0.0.1 week8.test' '::1 week8.test' >> /etc/hosts" with prompt "Add week8.test to /etc/hosts so https://week8.test resolves to this Mac." with administrator privileges
EOF
fi

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is not installed. Install it with: brew install mkcert" >&2
  exit 1
fi

if ! command -v certutil >/dev/null 2>&1; then
  if [ -x "$(brew --prefix nss)/bin/certutil" ]; then
    :
  else
    brew install nss
  fi
fi
export PATH="$(brew --prefix nss)/bin:$PATH"

mkdir -p certs
mkcert -cert-file certs/week8.test.pem -key-file certs/week8.test-key.pem week8.test
chmod 644 certs/week8.test.pem certs/week8.test-key.pem

# nss is Firefox's certificate store. System keychain trust is not enough.
TRUST_STORES=nss mkcert -install

profiles_root="$HOME/Library/Application Support/Firefox/Profiles"
if [ -d "$profiles_root" ]; then
  for profile in "$profiles_root"/*; do
    [ -d "$profile" ] || continue
    user_js="$profile/user.js"
    if ! grep -q 'security.enterprise_roots.enabled' "$user_js" 2>/dev/null; then
      printf '\nuser_pref("security.enterprise_roots.enabled", true);\n' >> "$user_js"
    fi
  done
fi

echo "week8.test is ready. Restart Firefox, then open https://week8.test"
