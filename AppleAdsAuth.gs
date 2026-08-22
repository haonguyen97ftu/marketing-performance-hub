/**
 * Marketing Performance Hub
 * Step 17.9A — Apple Ads OAuth and organization discovery.
 *
 * Required Script Properties:
 *   APPLE_ADS_CLIENT_ID
 *   APPLE_ADS_TEAM_ID
 *   APPLE_ADS_KEY_ID
 *   APPLE_ADS_PRIVATE_KEY
 *
 * Required existing project function:
 *   upsertAccounts_(accounts)
 *
 * Apple requires an ES256-signed client secret. Google Apps Script does not
 * expose an ECDSA signing helper, so this file contains a small P-256 signer.
 * No external library or service is required.
 *
 * This file never logs credentials, private keys, access tokens, or full
 * organization IDs.
 */

const APPLE_ADS_179A = Object.freeze({
  PLATFORM: "Apple Search Ads",
  API_VERSION: "v5",
  API_BASE_URL:
    "https://api.searchads.apple.com/api/v5",
  TOKEN_URL:
    "https://appleid.apple.com/auth/oauth2/token",
  TOKEN_SCOPE: "searchadsorg",
  TOKEN_CACHE_KEY:
    "APPLE_ADS_ACCESS_TOKEN_179A",
  CLIENT_SECRET_LIFETIME_SECONDS: 300
});


/**
 * Step 17.9A entry point.
 *
 * Verifies the four Script Properties, creates an ES256 client secret,
 * exchanges it for an access token, fetches accessible Apple Ads
 * organizations, and inserts them into Accounts with Enabled = false.
 */
function step179TestAppleAdsConnection() {
  const startedAt = new Date();
  const runId =
    typeof createRunId_ === "function"
      ? createRunId_()
      : Utilities.getUuid();

  try {
    assertAppleAdsDependencies179A_();

    const credentials =
      getAppleAdsCredentials179A_(
        PropertiesService.getScriptProperties()
      );
    const accessToken =
      getAppleAdsAccessToken179A_(
        credentials,
        false
      );
    const organizations =
      getAppleAdsOrganizations179A_(
        accessToken
      );

    if (!organizations.length) {
      throw new Error(
        "Apple Ads OAuth succeeded, but Get User ACL returned " +
        "no accessible organizations. Confirm that the API client " +
        "has access to an active Apple Ads account."
      );
    }

    const registryRows =
      organizations.map(function (organization) {
        return {
          platform: APPLE_ADS_179A.PLATFORM,
          accountId: organization.accountId,
          accountName: organization.accountName,
          currency: organization.currency,
          timezone: organization.timezone,
          enabled: false,
          status: "DISCOVERED"
        };
      });

    const registryResult =
      upsertAccounts_(registryRows);
    const finishedAt = new Date();
    const summary = {
      status: "SUCCESS",
      runId: runId,
      step: "17.9A",
      apiVersion: APPLE_ADS_179A.API_VERSION,
      oauth: "SUCCESS",
      accessibleOrganizations:
        organizations.length,
      inserted: registryResult.inserted,
      updated: registryResult.updated,
      organizations:
        organizations.map(function (organization) {
          return {
            accountName:
              organization.accountName,
            maskedAccountId:
              maskAppleAdsId179A_(
                organization.accountId
              ),
            currency: organization.currency,
            paymentModel:
              organization.paymentModel,
            roles: organization.roles
          };
        }),
      durationSeconds:
        roundAppleAdsSeconds179A_(
          finishedAt - startedAt
        ),
      secretsExposed: false
    };

    writeAppleAdsStep179ALog_({
      runId: runId,
      startedAt: startedAt,
      finishedAt: finishedAt,
      status: "SUCCESS",
      records: organizations.length,
      message:
        "Apple Ads OAuth and organization discovery completed."
    });

    console.log(
      JSON.stringify(summary, null, 2)
    );

    return summary;

  } catch (error) {
    const finishedAt = new Date();
    const safeMessage =
      sanitizeAppleAdsMessage179A_(
        error && error.message
          ? error.message
          : String(error)
      );

    writeAppleAdsStep179ALog_({
      runId: runId,
      startedAt: startedAt,
      finishedAt: finishedAt,
      status: "FAILED",
      records: 0,
      message: safeMessage
    });

    const failedSummary = {
      status: "FAILED",
      runId: runId,
      step: "17.9A",
      apiVersion: APPLE_ADS_179A.API_VERSION,
      error: safeMessage,
      durationSeconds:
        roundAppleAdsSeconds179A_(
          finishedAt - startedAt
        ),
      secretsExposed: false
    };

    console.log(
      JSON.stringify(failedSummary, null, 2)
    );

    throw new Error(safeMessage);
  }
}


/**
 * Forces a fresh Apple OAuth exchange without updating Accounts.
 */
function step179RefreshAppleAdsAccessToken() {
  const credentials =
    getAppleAdsCredentials179A_(
      PropertiesService.getScriptProperties()
    );

  getAppleAdsAccessToken179A_(
    credentials,
    true
  );

  const result = {
    status: "SUCCESS",
    step: "17.9A OAuth refresh",
    accessTokenCached: true,
    secretsExposed: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}


function assertAppleAdsDependencies179A_() {
  if (typeof upsertAccounts_ !== "function") {
    throw new Error(
      "Missing project dependency: upsertAccounts_. " +
      "Keep Accounts.gs in the Apps Script project."
    );
  }
}


function getAppleAdsCredentials179A_(properties) {
  const privateKey =
    normalizeAppleAdsPrivateKey179A_(
      getRequiredAppleAdsProperty179A_(
        properties,
        "APPLE_ADS_PRIVATE_KEY"
      )
    );

  /*
   * Parse and validate the key before any HTTP request. This also catches the
   * common mistake of pasting public-key.pem into APPLE_ADS_PRIVATE_KEY.
   */
  extractAppleAdsPrivateScalar179A_(
    privateKey
  );

  return {
    clientId:
      getRequiredAppleAdsProperty179A_(
        properties,
        "APPLE_ADS_CLIENT_ID"
      ),
    teamId:
      getRequiredAppleAdsProperty179A_(
        properties,
        "APPLE_ADS_TEAM_ID"
      ),
    keyId:
      getRequiredAppleAdsProperty179A_(
        properties,
        "APPLE_ADS_KEY_ID"
      ),
    privateKey: privateKey
  };
}


function getRequiredAppleAdsProperty179A_(
  properties,
  key
) {
  const value = String(
    properties.getProperty(key) || ""
  ).trim();

  if (!value) {
    throw new Error(
      "Missing required Script Property: " + key
    );
  }

  return value;
}


function normalizeAppleAdsPrivateKey179A_(value) {
  const normalized = String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();

  if (
    normalized.indexOf(
      "-----BEGIN PUBLIC KEY-----"
    ) !== -1
  ) {
    throw new Error(
      "APPLE_ADS_PRIVATE_KEY contains a public key. " +
      "Use the complete contents of private-key.pem instead."
    );
  }

  if (
    normalized.indexOf(
      "-----BEGIN EC PRIVATE KEY-----"
    ) === -1 &&
    normalized.indexOf(
      "-----BEGIN PRIVATE KEY-----"
    ) === -1
  ) {
    throw new Error(
      "APPLE_ADS_PRIVATE_KEY is not a supported PEM private key. " +
      "Paste the complete private-key.pem value, including BEGIN " +
      "and END lines."
    );
  }

  return normalized;
}


function getAppleAdsAccessToken179A_(
  credentials,
  forceRefresh
) {
  const cache = CacheService.getScriptCache();

  if (!forceRefresh) {
    const cached = cache.get(
      APPLE_ADS_179A.TOKEN_CACHE_KEY
    );

    if (cached) {
      return cached;
    }
  }

  const clientSecret =
    createAppleAdsClientSecret179A_(
      credentials
    );
  const response = UrlFetchApp.fetch(
    APPLE_ADS_179A.TOKEN_URL,
    {
      method: "post",
      contentType:
        "application/x-www-form-urlencoded",
      payload: {
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: clientSecret,
        scope: APPLE_ADS_179A.TOKEN_SCOPE
      },
      muteHttpExceptions: true
    }
  );
  const statusCode = response.getResponseCode();
  const text = response.getContentText();
  const data =
    parseAppleAdsJson179A_(text);

  if (
    statusCode < 200 ||
    statusCode >= 300 ||
    !data.access_token
  ) {
    throw new Error(
      "Apple OAuth token exchange failed (" +
      statusCode +
      "): " +
      extractAppleAdsErrorMessage179A_(
        data,
        text
      )
    );
  }

  const expiresIn =
    Number(data.expires_in || 3600);
  const cacheSeconds = Math.max(
    60,
    Math.min(3300, expiresIn - 120)
  );

  cache.put(
    APPLE_ADS_179A.TOKEN_CACHE_KEY,
    String(data.access_token),
    cacheSeconds
  );

  return String(data.access_token);
}


function createAppleAdsClientSecret179A_(
  credentials
) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "ES256",
    kid: credentials.keyId,
    typ: "JWT"
  };
  const payload = {
    iss: credentials.teamId,
    iat: now - 30,
    exp:
      now +
      APPLE_ADS_179A
        .CLIENT_SECRET_LIFETIME_SECONDS,
    aud: "https://appleid.apple.com",
    sub: credentials.clientId
  };
  const signingInput = [
    base64UrlAppleAdsString179A_(
      JSON.stringify(header)
    ),
    base64UrlAppleAdsString179A_(
      JSON.stringify(payload)
    )
  ].join(".");
  const signature =
    signAppleAdsEs256179A_(
      signingInput,
      credentials.privateKey
    );

  return (
    signingInput +
    "." +
    base64UrlAppleAdsBytes179A_(signature)
  );
}


function getAppleAdsOrganizations179A_(
  accessToken
) {
  const data = fetchAppleAdsJson179A_({
    url:
      APPLE_ADS_179A.API_BASE_URL +
      "/acls",
    method: "get",
    accessToken: accessToken
  });
  const rows =
    Array.isArray(data.data)
      ? data.data
      : [];

  return rows
    .map(normalizeAppleAdsOrganization179A_)
    .filter(function (organization) {
      return Boolean(
        organization.accountId
      );
    });
}


function fetchAppleAdsJson179A_(config) {
  const response = UrlFetchApp.fetch(
    config.url,
    {
      method: config.method || "get",
      headers: {
        Authorization:
          "Bearer " + config.accessToken,
        Accept: "application/json"
      },
      muteHttpExceptions: true
    }
  );
  const statusCode = response.getResponseCode();
  const text = response.getContentText();
  const data =
    parseAppleAdsJson179A_(text);

  if (
    statusCode < 200 ||
    statusCode >= 300
  ) {
    throw new Error(
      "Apple Ads API request failed (" +
      statusCode +
      "): " +
      extractAppleAdsErrorMessage179A_(
        data,
        text
      )
    );
  }

  return data;
}


function normalizeAppleAdsOrganization179A_(
  raw
) {
  const organization = raw || {};
  const roles =
    Array.isArray(organization.roleNames)
      ? organization.roleNames
          .map(function (role) {
            return String(role || "").trim();
          })
          .filter(Boolean)
      : [];

  return {
    accountId: String(
      organization.orgId || ""
    ).trim(),
    accountName:
      String(
        organization.orgName || ""
      ).trim() ||
      "Apple Ads organization",
    currency: String(
      organization.currency || ""
    ).trim().toUpperCase(),
    timezone: String(
      organization.timeZone ||
      organization.timezone ||
      ""
    ).trim(),
    paymentModel: String(
      organization.paymentModel || ""
    ).trim(),
    roles: roles
  };
}


function parseAppleAdsJson179A_(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      rawText:
        String(text).slice(0, 1000)
    };
  }
}


function extractAppleAdsErrorMessage179A_(
  data,
  fallbackText
) {
  const candidates = [
    data && data.error_description,
    data &&
      data.error &&
      data.error.message,
    data &&
      typeof data.error === "string"
      ? data.error
      : "",
    data && data.message,
    data && data.rawText,
    fallbackText
  ];

  for (
    let index = 0;
    index < candidates.length;
    index++
  ) {
    const candidate = candidates[index];

    if (
      typeof candidate === "string" &&
      candidate.trim()
    ) {
      return sanitizeAppleAdsMessage179A_(
        candidate
      );
    }
  }

  return "Unknown Apple Ads API error.";
}


function sanitizeAppleAdsMessage179A_(message) {
  return String(message || "")
    .replace(
      /-----BEGIN (?:EC )?PRIVATE KEY-----[\s\S]*?-----END (?:EC )?PRIVATE KEY-----/g,
      "[PRIVATE_KEY_REDACTED]"
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[JWT_REDACTED]"
    )
    .replace(
      /SEARCHADS\.[A-Za-z0-9-]+/g,
      "[CLIENT_ID_REDACTED]"
    )
    .replace(
      /\b\d{6,}\b/g,
      function (identifier) {
        return (
          "****" +
          identifier.slice(-4)
        );
      }
    )
    .slice(0, 1500);
}


function maskAppleAdsId179A_(value) {
  const normalized =
    String(value || "").trim();

  if (!normalized) {
    return "";
  }

  return (
    "****" +
    normalized.slice(-4)
  );
}


function roundAppleAdsSeconds179A_(
  elapsedMilliseconds
) {
  return (
    Math.round(
      (elapsedMilliseconds / 1000) * 10
    ) / 10
  );
}


function writeAppleAdsStep179ALog_(entry) {
  if (typeof writeSyncLog_ !== "function") {
    return;
  }

  writeSyncLog_({
    runId: entry.runId,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    platform: APPLE_ADS_179A.PLATFORM,
    accountId: "",
    status: entry.status,
    records: entry.records,
    durationSeconds:
      (entry.finishedAt - entry.startedAt) /
      1000,
    message: entry.message
  });
}


/*
 * Minimal deterministic ES256 signer for Apple client-secret JWTs.
 *
 * It supports the two PEM formats produced by common OpenSSL commands:
 *   -----BEGIN EC PRIVATE KEY-----
 *   -----BEGIN PRIVATE KEY-----
 *
 * JWT ES256 signatures use the raw 64-byte R || S representation.
 */

const APPLE_ADS_P256_179A = Object.freeze({
  P: BigInt(
    "0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff"
  ),
  N: BigInt(
    "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"
  ),
  GX: BigInt(
    "0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"
  ),
  GY: BigInt(
    "0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"
  )
});


function signAppleAdsEs256179A_(
  message,
  privateKeyPem
) {
  const curve = APPLE_ADS_P256_179A;
  const privateScalar =
    extractAppleAdsPrivateScalar179A_(
      privateKeyPem
    );
  const hashBytes =
    normalizeAppleAdsBytes179A_(
      Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        String(message),
        Utilities.Charset.UTF_8
      )
    );
  const z =
    bytesToAppleAdsBigInt179A_(
      hashBytes
    ) % curve.N;
  let attempt = 0;

  while (attempt < 8) {
    const nonce =
      generateAppleAdsNonce179A_(
        privateScalar,
        hashBytes,
        attempt
      );
    const point =
      multiplyAppleAdsPoint179A_(
        nonce,
        {
          x: curve.GX,
          y: curve.GY
        }
      );
    const r = point.x % curve.N;

    if (r === BigInt(0)) {
      attempt += 1;
      continue;
    }

    let s =
      modAppleAdsBigInt179A_(
        inverseAppleAdsBigInt179A_(
          nonce,
          curve.N
        ) *
        modAppleAdsBigInt179A_(
          z +
          r * privateScalar,
          curve.N
        ),
        curve.N
      );

    if (s === BigInt(0)) {
      attempt += 1;
      continue;
    }

    /*
     * Low-S normalization avoids signature malleability and is accepted by
     * standard ES256 verifiers.
     */
    if (s > curve.N / BigInt(2)) {
      s = curve.N - s;
    }

    return bigIntToAppleAdsBytes179A_(r, 32)
      .concat(
        bigIntToAppleAdsBytes179A_(
          s,
          32
        )
      );
  }

  throw new Error(
    "Unable to create a valid Apple ES256 signature."
  );
}


function extractAppleAdsPrivateScalar179A_(
  privateKeyPem
) {
  const body = String(privateKeyPem || "")
    .replace(
      /-----BEGIN [^-]+-----/g,
      ""
    )
    .replace(
      /-----END [^-]+-----/g,
      ""
    )
    .replace(/\s+/g, "");
  let der;

  try {
    der =
      normalizeAppleAdsBytes179A_(
        Utilities.base64Decode(body)
      );
  } catch (error) {
    throw new Error(
      "APPLE_ADS_PRIVATE_KEY contains invalid base64."
    );
  }

  /*
   * Both SEC1 and PKCS#8 P-256 private keys contain the private scalar as a
   * 32-byte ASN.1 OCTET STRING (04 20 <32 bytes>).
   */
  for (
    let index = 0;
    index <= der.length - 34;
    index++
  ) {
    if (
      der[index] === 0x04 &&
      der[index + 1] === 0x20
    ) {
      const scalarBytes =
        der.slice(index + 2, index + 34);
      const scalar =
        bytesToAppleAdsBigInt179A_(
          scalarBytes
        );

      if (
        scalar > BigInt(0) &&
        scalar <
          APPLE_ADS_P256_179A.N
      ) {
        return scalar;
      }
    }
  }

  throw new Error(
    "APPLE_ADS_PRIVATE_KEY is not a valid P-256 private key. " +
    "Use the private-key.pem generated for the public key saved in Apple Ads."
  );
}


function generateAppleAdsNonce179A_(
  privateScalar,
  hashBytes,
  retry
) {
  const curve = APPLE_ADS_P256_179A;
  const x =
    bigIntToAppleAdsBytes179A_(
      privateScalar,
      32
    );
  const hashValue =
    bytesToAppleAdsBigInt179A_(
      hashBytes
    ) % curve.N;
  const h1 =
    bigIntToAppleAdsBytes179A_(
      hashValue,
      32
    );
  const retryBytes =
    retry > 0
      ? [retry & 0xff]
      : [];
  let v = new Array(32).fill(0x01);
  let k = new Array(32).fill(0x00);

  k = hmacAppleAdsSha256179A_(
    k,
    v.concat([0x00], x, h1, retryBytes)
  );
  v = hmacAppleAdsSha256179A_(k, v);
  k = hmacAppleAdsSha256179A_(
    k,
    v.concat([0x01], x, h1, retryBytes)
  );
  v = hmacAppleAdsSha256179A_(k, v);

  while (true) {
    v = hmacAppleAdsSha256179A_(k, v);

    const candidate =
      bytesToAppleAdsBigInt179A_(v);

    if (
      candidate > BigInt(0) &&
      candidate < curve.N
    ) {
      return candidate;
    }

    k = hmacAppleAdsSha256179A_(
      k,
      v.concat([0x00])
    );
    v = hmacAppleAdsSha256179A_(k, v);
  }
}


function hmacAppleAdsSha256179A_(
  keyBytes,
  valueBytes
) {
  return normalizeAppleAdsBytes179A_(
    Utilities.computeHmacSha256Signature(
      toAppleAdsUtilityBytes179A_(
        valueBytes
      ),
      toAppleAdsUtilityBytes179A_(
        keyBytes
      )
    )
  );
}


function multiplyAppleAdsPoint179A_(
  scalar,
  point
) {
  let result = null;
  let addend = point;
  let value = scalar;

  while (value > BigInt(0)) {
    if (value & BigInt(1)) {
      result =
        addAppleAdsPoints179A_(
          result,
          addend
        );
    }

    addend =
      addAppleAdsPoints179A_(
        addend,
        addend
      );
    value >>= BigInt(1);
  }

  if (!result) {
    throw new Error(
      "Invalid Apple ES256 scalar multiplication."
    );
  }

  return result;
}


function addAppleAdsPoints179A_(
  left,
  right
) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  const p = APPLE_ADS_P256_179A.P;

  if (
    left.x === right.x &&
    modAppleAdsBigInt179A_(
      left.y + right.y,
      p
    ) === BigInt(0)
  ) {
    return null;
  }

  let slope;

  if (
    left.x === right.x &&
    left.y === right.y
  ) {
    slope =
      modAppleAdsBigInt179A_(
        (BigInt(3) * left.x * left.x - BigInt(3)) *
        inverseAppleAdsBigInt179A_(
          BigInt(2) * left.y,
          p
        ),
        p
      );
  } else {
    slope =
      modAppleAdsBigInt179A_(
        (right.y - left.y) *
        inverseAppleAdsBigInt179A_(
          right.x - left.x,
          p
        ),
        p
      );
  }

  const x =
    modAppleAdsBigInt179A_(
      slope * slope -
      left.x -
      right.x,
      p
    );
  const y =
    modAppleAdsBigInt179A_(
      slope * (left.x - x) -
      left.y,
      p
    );

  return { x: x, y: y };
}


function inverseAppleAdsBigInt179A_(
  value,
  modulus
) {
  let low =
    modAppleAdsBigInt179A_(
      value,
      modulus
    );
  let high = modulus;
  let lm = BigInt(1);
  let hm = BigInt(0);

  if (low === BigInt(0)) {
    throw new Error(
      "Invalid Apple ES256 modular inverse."
    );
  }

  while (low > BigInt(1)) {
    const ratio = high / low;
    const next = high - low * ratio;
    const nextCoefficient =
      hm - lm * ratio;

    high = low;
    low = next;
    hm = lm;
    lm = nextCoefficient;
  }

  return modAppleAdsBigInt179A_(
    lm,
    modulus
  );
}


function modAppleAdsBigInt179A_(
  value,
  modulus
) {
  const result = value % modulus;
  return result >= BigInt(0)
    ? result
    : result + modulus;
}


function bytesToAppleAdsBigInt179A_(
  bytes
) {
  let value = BigInt(0);

  normalizeAppleAdsBytes179A_(
    bytes
  ).forEach(function (byte) {
    value =
      (value << BigInt(8)) +
      BigInt(byte);
  });

  return value;
}


function bigIntToAppleAdsBytes179A_(
  value,
  length
) {
  let remaining = value;
  const bytes = new Array(length).fill(0);

  for (
    let index = length - 1;
    index >= 0;
    index--
  ) {
    bytes[index] =
      Number(remaining & BigInt(255));
    remaining >>= BigInt(8);
  }

  if (remaining !== BigInt(0)) {
    throw new Error(
      "Apple ES256 integer exceeds its expected byte length."
    );
  }

  return bytes;
}


function normalizeAppleAdsBytes179A_(
  bytes
) {
  return Array.prototype.map.call(
    bytes || [],
    function (byte) {
      return (Number(byte) + 256) % 256;
    }
  );
}


function toAppleAdsUtilityBytes179A_(
  bytes
) {
  return normalizeAppleAdsBytes179A_(
    bytes
  ).map(function (byte) {
    return byte > 127
      ? byte - 256
      : byte;
  });
}


function base64UrlAppleAdsString179A_(
  value
) {
  return Utilities.base64EncodeWebSafe(
    String(value),
    Utilities.Charset.UTF_8
  ).replace(/=+$/g, "");
}


function base64UrlAppleAdsBytes179A_(
  bytes
) {
  return Utilities.base64EncodeWebSafe(
    toAppleAdsUtilityBytes179A_(bytes)
  ).replace(/=+$/g, "");
}
