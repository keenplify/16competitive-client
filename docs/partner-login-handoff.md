# Partner application login handoff

Add a PLAY action to your existing application so a signed-in player can open the 1.6 Competitive PWA using their existing account. Your application creates a short-lived token. Our backend validates it with your server and receives the player's identity. No player password is exchanged.

Use your existing programming language, authentication system, and data store. This contract does not require PHP, SQL, a particular framework, or an existing CSRF setup. Implement the behavior below using your application's normal conventions.

The partner ID is `PARTNER_ID`. Partner sign-in requires the matching 1.6 Competitive API and PWA deployment plus backend secret-encryption configuration. The admin interface can be deployed independently; it shows settings as unavailable until that API is ready. A partner link without a token continues to supply community context and referral handling.

## Configuration

Your partner admin can configure the validation endpoint in the 1.6 Competitive admin portal. An example endpoint is `https://www.olaguergeyming.com/gamehub/validate`; choose a path that fits your application.

Configure these values on your server:

- Partner ID: `PARTNER_ID`.
- Validation secret: a dedicated secret shared only with the 1.6 Competitive backend. Generate at least 32 cryptographically random bytes, encoded as base64url.
- Token lifetime: 60 seconds.
- PWA destination: `https://16competitive.papamo.dev/pwa/`.

Keep the validation secret in protected server configuration or a secret manager. Never place it in frontend JavaScript, links, logs, source control, or token records. The admin portal treats it as write-only. Exchange the secret through a secure configuration channel, not an AI conversation.

The validation URL is saved in admin. Do not include a `validate-url` parameter in player links. Our backend chooses the endpoint from the saved partner configuration.

## Token storage

Use the application's existing data store. Create a table, collection, key namespace, or equivalent containing these fields:

| Field | Value |
| --- | --- |
| `tokenHash` | SHA-256 digest of the encoded token; unique key |
| `userId` | Existing user's stable primary identifier, using your application's actual identifier type |
| `createdAt` | Issue time in UTC |
| `expiresAt` | Issue time plus 60 seconds |
| `consumedAt` | UTC consumption time, initially absent or null |

Store the digest as 32 bytes or its 64-character hexadecimal representation, consistently at creation and redemption. Do not store the raw token or copy player passwords. Use shared storage if the application runs on multiple instances. A durable or shared store is preferred; process memory is suitable only for a single-instance prototype where losing pending tokens on restart is acceptable.

Enforce expiration during validation even when cleanup has not run. Use a TTL facility or periodic cleanup to remove expired records. The store must support atomic consumption so concurrent requests cannot redeem the same token twice.

## PLAY action

Implement PLAY as a POST handled by your server. It requires the player to be signed in through your existing authentication system. Resolve the user from that authenticated session or access token, regardless of the language or framework.

A player must not be able to supply another user's ID, username, or email to mint a token for them. Do not accept these identity fields from the PLAY request. Fetch them from the authenticated user's account.

1. Require a valid, active signed-in user.
2. Apply a modest per-user creation limit to prevent token-store flooding.
3. Generate 32 cryptographically random bytes using your language's secure random generator.
4. Encode them as unpadded base64url. This produces a 43-character token.
5. Store the SHA-256 digest of that encoded token with the authenticated user's stable ID and a 60-second expiration.
6. After storage succeeds, open the PWA URL below using the new token. A web application can send an HTTP 303 redirect. A native application can return the URL to its PLAY handler and open it in the browser.

```text
https://16competitive.papamo.dev/pwa/?partnerId=PARTNER_ID&token=TOKEN
```

Use your platform's URL query builder. Keep the destination fixed to the PWA origin. Each click generates a fresh token. Never use a password, password hash, email address, user ID, predictable value, or long-lived login token as the handoff token.

## Validation endpoint

Implement an HTTPS POST endpoint at the URL saved in admin. Our backend calls it directly. The endpoint must not require the player's browser session cookie and does not need browser CORS access.

Request:

```http
POST /gamehub/validate HTTP/1.1
Authorization: Bearer SHARED_VALIDATION_SECRET
Content-Type: application/json
Accept: application/json

{
  "partnerId": "PARTNER_ID",
  "token": "TOKEN"
}
```

Verify the shared secret using your platform's constant-time comparison before looking up or consuming a token. Require the configured partner ID. Accept JSON only, bound the request body size, and require the token to match `^[A-Za-z0-9_-]{43}$`.

Perform these steps with a transaction, row lock, conditional atomic update, compare-and-swap, or another atomic mechanism supported by your store:

1. Compute the SHA-256 digest of the encoded token.
2. Locate the matching record and require that it is unconsumed and has not expired.
3. Resolve the referenced user from your existing accounts. Reject deleted, disabled, or otherwise ineligible accounts according to your application rules.
4. Atomically consume the token. Only the request that successfully consumes it may return an identity.
5. Return the identity after consumption succeeds.

Do not use an unlocked read followed by a separate write. Two concurrent requests for the same token must produce exactly one success. A lost response does not make the token reusable; the player can click PLAY again.

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

`userId` must be an immutable account identifier represented as a string. It can come from a numeric key, UUID, document ID, or another stable key. Never recycle it for a different person. Our identity mapping uses `(partnerId, userId)` because usernames and emails can change.

Limit `userId` and `username` to 128 characters and `email` to 254 characters. Return plain JSON strings, not HTML-encoded values. `emailVerified` must reflect an actual completed verification process in your application. If your application does not verify email, return `false`. If there is no email, return `"email": null` and `"emailVerified": false`. Do not invent an address or claim verification because an email value exists. Our account-creation flow may ask the player to supply and verify an email.

Do not return player passwords, password hashes, login cookies, database credentials, or 1.6 Competitive permissions, MMR, bans, or inventory. This endpoint proves identity within your application's namespace. Our backend controls its own account state and permissions.

## Error responses

Return JSON and `Cache-Control: no-store` on every response:

| Status | JSON response | Condition |
| --- | --- | --- |
| 400 | `{"error":"INVALID_REQUEST"}` | Invalid JSON, partner ID, token format, or oversized body |
| 401 | `{"error":"UNAUTHORIZED"}` | Missing or incorrect integration secret |
| 401 | `{"error":"INVALID_HANDOFF"}` | Missing, expired, consumed token, or unavailable user |
| 405 | `{"error":"METHOD_NOT_ALLOWED"}` | Non-POST request; include `Allow: POST` |
| 429 | `{"error":"RATE_LIMITED"}` | Validation limit exceeded; include `Retry-After` |
| 503 | `{"error":"TEMPORARILY_UNAVAILABLE"}` | Temporary service or storage failure |

Do not return storage queries, stack traces, tokens, or secrets. Roll back incomplete transactions where applicable. Authentication failures must not consume tokens. Missing, expired, consumed, and unavailable-user cases use the same error to avoid exposing account details.

## Work on the 1.6 Competitive side

Our integration must provide partner-scoped admin settings for the validation URL, secret, and enable switch. The backend must validate the saved endpoint as public HTTPS, block private and internal destinations including IPv6, guard against DNS rebinding, disable redirects, verify TLS, and bound timeouts and response sizes. It must never fetch an endpoint supplied in the player URL.

The PWA must remove the handoff token from the address bar immediately, use `Referrer-Policy: no-referrer`, and exclude it from logs, analytics, diagnostic reports, service-worker caches, localStorage, polling requests, return URLs, and subsequent navigation. Redemption happens on our backend; the validation secret never reaches the PWA.

Our login completion must bind to a browser transaction and confirm the returned identity before completing direct partner-initiated sign-in. It must not silently replace an existing session. Account mapping uses `(partnerId, userId)`. Matching usernames or emails alone must not link an existing 1.6 Competitive account; that requires authentication to the existing account.

After validation, our backend issues a normal 1.6 Competitive session. The partner token is never accepted as a normal API session token. The PWA activates the partner presentation and applies its community-discovery setting, while referral attribution and membership changes follow existing backend rules.

## Deliverables for the partner developer or AI

Identify the existing authentication mechanism, account store, stable user ID, username/email fields, disabled-account rule, and email-verification source. Implement the token-store migration or setup, PLAY action, validation endpoint, configuration example using placeholders, and automated tests in the application's existing language and style. Do not replace the application's login system or introduce a new database solely for this integration.

Test successful creation and redemption; rejection of unsigned players; inability to mint for another user; 60-second expiration; replay rejection; exactly one success for concurrent redemption; incorrect-secret rejection without consuming a token; disabled-user rejection; accurate missing/unverified email handling; safe storage failures; and logs without tokens or secrets.

Return the final deployed validation URL and integration instructions. Configure the shared secret through a secure channel. Never paste production secrets into an AI conversation or commit them to source control.

## Completion on 1.6 Competitive

The PWA removes the incoming token from the URL before application startup and sends `{partnerId, token}` to `POST /auth/partner-login/begin`. Our backend redeems it with your configured endpoint and returns a short-lived confirmation proof. No player session is issued at this stage.

The player confirms the displayed identity, then the PWA sends `{proof, action}` to `POST /auth/partner-login/complete`, where `action` is `sign_in` or `link`. Linking requires the player's existing 1.6 Competitive session and an explicit choice. Both the incoming token and confirmation proof are one-time values. Confirmations expire after two minutes. Disabling sign-in or changing its settings invalidates outstanding confirmations.

If a verified partner email already belongs to an existing 1.6 Competitive account, the player must sign in normally and explicitly link it. Unverified partner emails are not imported into the local account or used for password recovery. A new local account can be created without a password or email and completes the existing username-setup flow.

Deployment operators must set `PARTNER_LOGIN_ENCRYPTION_KEY` to the same stable 64-character hexadecimal key on every API region, then run migration `0125_partner_login` through the normal deployment process. Keep the key in protected backend configuration and preserve it across updates; changing it requires partners to save new validation secrets. The key is not a partner integration secret and must never be entered in admin or shared with partners.
