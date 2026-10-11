# Test fixtures

`test-ca.crt` / `test-ca.key` are a **throwaway self-signed certificate** (CN `changelens-test-localhost`,
SAN `localhost` / `127.0.0.1`) used only by `tests/kubernetesTls.test.ts` to prove the Kubernetes client
trusts a configured private CA while still verifying certificates.

The private key protects nothing: it was generated for this test, is valid only for loopback, and is
never loaded by application code. It is expected to show up in secret scanners; allow-list this folder.
Regenerate with:

    openssl req -x509 -newkey rsa:2048 -nodes -keyout test-ca.key -out test-ca.crt -days 36500 \
      -subj "/CN=changelens-test-localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
