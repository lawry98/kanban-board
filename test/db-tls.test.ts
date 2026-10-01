import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { resolveSsl } from '@/lib/db-tls';

import type { ConnectionOptions } from 'node:tls';

const POOLER_URL = 'postgresql://postgres.ref:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

// SHA-256 of `prod-ca-2021.crt` as downloaded from Supabase, and of the root the
// pooler serves at the top of its chain. Both were checked to be byte-identical.
const SUPABASE_ROOT_2021_SHA256 =
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';

function trustedCa(ssl: ConnectionOptions | false): X509Certificate {
  if (!ssl || typeof ssl.ca !== 'string') throw new Error('expected a pinned CA');
  return new X509Certificate(ssl.ca);
}

describe('resolveSsl', () => {
  it('trusts the Supabase root CA by default, with verification on', () => {
    // Supabase signs its database certs with a private root that is not in Node's
    // trust store; without it the handshake fails with SELF_SIGNED_CERT_IN_CHAIN.
    const ssl = resolveSsl(POOLER_URL, undefined);

    expect(ssl).toMatchObject({ rejectUnauthorized: true });
    const ca = trustedCa(ssl);
    expect(ca.ca).toBe(true);
    expect(ca.subject).toContain('CN=Supabase Root 2021 CA');
    expect(ca.fingerprint256).toBe(SUPABASE_ROOT_2021_SHA256);
  });

  it('lets SUPABASE_CA_CERT replace the bundled CA', () => {
    expect(resolveSsl(POOLER_URL, 'override-pem')).toEqual({
      rejectUnauthorized: true,
      ca: 'override-pem',
    });
  });

  it('turns TLS off only for sslmode=disable', () => {
    expect(
      resolveSsl('postgresql://postgres@localhost:54322/postgres?sslmode=disable', undefined),
    ).toBe(false);
  });
});
