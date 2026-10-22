# Partner PHP login handoff

Implement passwordless sign-in from the partner's existing PHP and MySQL application into the 1.6 Competitive PWA. The player clicks PLAY while signed in to the partner application. PHP creates a short-lived, single-use token. The 1.6 Competitive backend redeems it directly with PHP and receives the player's identity. Passwords stay in the partner application.

This is the integration contract for the partner's AI developer. The token login callback and partner validation settings still need implementation on the 1.6 Competitive side before this flow can sign players in. The existing `partnerId` PWA link currently supplies partner context and referral handling.

## Partner configuration

The partner will configure these values in the 1.6 Competitive admin portal:

- Partner sign-in enabled.
- Validation URL, for example `https://www.olaguergeyming.com/gamehub/validate`.
- A dedicated validation secret, shared only between the two servers. Generate at least 32 random bytes and encode them as base64url. This is an integration credential, never a player password.

The partner ID for this example is `d2612912-efb2-4406-b9d4-490bf3874dda`. Configure this ID on the PHP server; do not take it from arbitrary player input.

The validation URL belongs in admin configuration. Do not include a `validate-url` parameter in the player link. The 1.6 Competitive backend chooses the endpoint from the saved partner configuration and never fetches a player-supplied validation URL.

Keep the shared validation secret in an environment variable or protected server configuration outside the web root and source control. The admin portal must treat the secret as write-only. Do not put it in JavaScript, a redirect URL, HTML, logs, or the MySQL token table.

## MySQL table

Use InnoDB so row locking and transactions work. Add this table through the application's migration system:

```sql
CREATE TABLE competitive_login_handoffs (
    token_hash BINARY(32) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    PRIMARY KEY (token_hash),
    KEY handoffs_expiry_idx (expires_at),
    KEY handoffs_user_idx (user_id)
) ENGINE=InnoDB;
```

Adapt `user_id` to the exact type of the application's existing user primary key. Add a foreign key to the real users table where compatible. Do not create a second player credential table or copy passwords into this table. Use UTC for every timestamp and set the MySQL connection timezone to `+00:00`.

Store the SHA-256 digest of the token, not the token itself. Use a scheduled cleanup job to delete expired records after a short retention period, for example one day. Expiration checks must work even if cleanup has not run.

## PLAY action

Implement the PLAY action as an authenticated POST protected by the application's normal CSRF checks. Use the user ID from the current PHP session. A player must not be able to supply another user's ID, username, or email to mint a token for them.

1. Require a valid, active signed-in user.
2. Apply a modest per-user creation limit to prevent token-table flooding.
3. Generate 32 cryptographically random bytes using PHP `random_bytes(32)`.
4. Encode the bytes as unpadded base64url. A 32-byte value produces a 43-character token.
5. Hash the encoded token with `hash('sha256', $token, true)` and store its 32-byte digest.
6. Set `created_at = UTC_TIMESTAMP(6)`, `expires_at = UTC_TIMESTAMP(6) + INTERVAL 60 SECOND`, and `consumed_at = NULL`.
7. After the insert commits, redirect using HTTP 303 to the fixed PWA origin below. Build the query with `http_build_query(..., PHP_QUERY_RFC3986)`.

```text
https://16competitive.papamo.dev/pwa/?partnerId=d2612912-efb2-4406-b9d4-490bf3874dda&token=TOKEN
```

Example token generation:

```php
$token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
$tokenHash = hash('sha256', $token, true);
```

Use parameterized PDO queries with emulated prepares disabled. Never use a password, password hash, email address, user ID, predictable value, or long-lived PHP session ID as the token. Each click produces a fresh token.

## Validation endpoint

Implement `POST /gamehub/validate` at the URL saved in admin. This endpoint is called by the 1.6 Competitive backend, not directly by the browser. It needs no permissive CORS policy and must not depend on the player's PHP session cookie.

Request:

```http
POST /gamehub/validate HTTP/1.1
Authorization: Bearer SHARED_VALIDATION_SECRET
Content-Type: application/json
Accept: application/json

{
  "partnerId": "d2612912-efb2-4406-b9d4-490bf3874dda",
  "token": "TOKEN"
}
```

Read the Authorization header and compare the supplied secret with the configured secret using `hash_equals`. Authenticate the caller before looking up or consuming a token. Reject an incorrect partner ID. Accept POST only, require JSON, limit the body size, and require the token to match `^[A-Za-z0-9_-]{43}$`.

Perform redemption atomically:

1. Start a transaction.
2. Select the token row by `token_hash = hash('sha256', $token, true)` using `SELECT ... FOR UPDATE`.
3. Reject a missing, consumed, or expired row. Compare expiration against the database's UTC time while holding the row lock.
4. Fetch the referenced user from the existing user table. Reject deleted, disabled, or otherwise ineligible accounts according to the partner's own account rules.
5. Mark `consumed_at = UTC_TIMESTAMP(6)` and commit.
6. Return the identity below only after the transaction succeeds.

Two simultaneous requests for the same token must produce exactly one success. Never implement redemption as an unlocked SELECT followed by an UPDATE. A lost response does not make the token reusable; the player can click PLAY again for a new token.

Successful response:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-store

{
  "userId": "12345",
  "username": "username",
  "email": "email@testemail.com",
  "emailVerified": true
}
```

`userId` is the immutable primary key of the partner's user, represented as a string. Never recycle it for a different person. The 1.6 Competitive identity mapping uses the pair `(partnerId, userId)`; usernames and emails can change. Limit `userId` and `username` to 128 characters and `email` to 254 characters. Return plain JSON strings, not HTML-encoded values.

`emailVerified` must reflect a completed email verification process on the partner application. If the application does not verify email, return `false`. If the user has no email, return `"email": null` and `"emailVerified": false`. Do not invent an email or claim verification because a value exists in MySQL. Account creation may require the player to supply and verify an email on 1.6 Competitive.

Do not return passwords, password hashes, PHP session cookies, roles for 1.6 Competitive, MMR, bans, inventory, or database credentials. This endpoint proves an identity in the partner's namespace; the 1.6 Competitive backend controls its own accounts and permissions.

## Error responses

Return JSON with `Cache-Control: no-store` on every response. Use these stable status codes and error strings:

| Status | JSON response | Condition |
| --- | --- | --- |
| 400 | `{"error":"INVALID_REQUEST"}` | Invalid JSON, partner ID, token format, or oversized body |
| 401 | `{"error":"UNAUTHORIZED"}` | Missing or incorrect integration secret |
| 401 | `{"error":"INVALID_HANDOFF"}` | Missing, expired, already consumed token, or unavailable user |
| 405 | `{"error":"METHOD_NOT_ALLOWED"}` | Non-POST request; include `Allow: POST` |
| 429 | `{"error":"RATE_LIMITED"}` | Validation limit exceeded; include `Retry-After` |
| 503 | `{"error":"TEMPORARILY_UNAVAILABLE"}` | Temporary service or database failure |

Do not return SQL details, stack traces, token values, or distinguish whether an invalid token referenced a real user. Roll back incomplete transactions. Do not consume tokens when caller authentication fails.

## Responsibilities on 1.6 Competitive

The integration on our side must:

- Restrict partner configuration changes to that partner's authorized admins. Store the validation secret securely on the backend.
- Validate the saved endpoint as public HTTPS, block internal, loopback, link-local, private, and metadata addresses for both IPv4 and IPv6, and recheck DNS resolution when connecting. Disable redirects, enforce TLS verification, and bound timeouts and response sizes. Never use a query parameter to select the endpoint.
- Remove the token from the address bar immediately, use `Referrer-Policy: no-referrer`, and exclude it from analytics, diagnostic reports, and access logs. Neither localStorage nor a service-worker cache should retain it. Strip it from API polling, return URLs, and subsequent navigation.
- Redeem the token on the backend. Do not give the validation secret to the PWA or trust identity JSON supplied by the browser.
- Bind completion to a browser login transaction with CSRF protection. Confirm the returned identity with the player before completing a direct partner-initiated sign-in, and never silently replace an existing session. An optional future state-based flow can avoid the extra confirmation.
- Map `(partnerId, userId)` to a local player. Do not automatically link an existing account because its email or username matches. Require authentication to that existing account before linking it.
- Issue a normal 1.6 Competitive session using the existing web authentication mechanism after successful validation. Do not accept the partner token as a normal API session token.
- Activate the partner's PWA presentation and apply its community-discovery setting. Keep referral attribution and community transfer decisions under existing backend rules.

## Deliverables and acceptance tests

The partner's AI should deliver the MySQL migration, authenticated PLAY action, validation endpoint, configuration example with placeholders, and automated tests. It should identify the real user table, primary key, username/email fields, account-disable rule, and email-verification source before implementing the mapping.

Verify that a signed-in player can create and redeem a token; the identity comes from their existing account; an unsigned user cannot mint one; a user cannot mint one for another user; tokens expire after 60 seconds; replay fails; two concurrent redemptions yield one success; an incorrect secret does not consume a token; disabled users fail; missing/unverified email is represented accurately; transaction failures do not leak credentials; and logs contain neither tokens nor secrets.

Return the final deployed validation URL and confirm the shared secret through a secure configuration channel. Do not paste production secrets into an AI conversation or commit them to the repository.
