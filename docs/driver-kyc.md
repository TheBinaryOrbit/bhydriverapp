# Driver KYC (Aadhaar / DigiLocker) — Frontend Guide

How the driver app starts Aadhaar verification and finds out whether it
succeeded. KYC runs through **Signzy's DigiLocker** flow.

Related: [Driver Login & Onboarding](./driver-auth-onboarding.md) ·
[Profile, Vehicle & Payments](./driver-profile-and-payments.md)

- **Base URL:** `http://localhost:5000/api/v3` (dev)

---

## Two entry points

The same DigiLocker flow is reached from two places, and they identify the
driver differently:

| Entry | Identity | Endpoints |
| ----- | -------- | --------- |
| **Pre-signup** — OTP was correct but `/auth/verify` returned `userStatus: 404` | The **phone number** just OTP-verified | `POST /drivers/kyc/verify` · `GET /drivers/kyc/status/:phoneNumber` |
| **Profile** — a signed-in driver who hasn't verified yet | Bearer **token**, plus the same body | `POST /drivers/kyc/verify` · `GET /drivers/me` |

`POST /drivers/kyc/verify` serves both: it takes `{ phoneNumber }` either way and
the token is only added when there is one.

Steps 1–4 below describe the **profile** flow. The pre-signup flow is the same
three moves — start, watch the WebView, confirm — against the phone-keyed
endpoints; see [Pre-signup KYC](#pre-signup-kyc-by-phone-number) for what
differs.

---

## The one thing to understand first

There are two callbacks in this flow and **only one of them involves your app**:

| | Who calls it | Your job |
| --- | --- | --- |
| `POST /drivers/kyc/callback/:driverId` | **Signzy's servers → our backend.** Server-to-server. | **Nothing.** Never call this endpoint. It is not for the app |
| `successRedirectUrl` / `failureRedirectUrl` | The **browser/WebView** after the driver finishes | Detect the redirect, close the WebView, then poll for status |

The redirect tells you the driver *finished the screen*. It does **not** tell you
the verification was recorded — only a status read does that (`GET /drivers/me`,
or `GET /kyc/status/:phoneNumber` before an account exists).

---

## Flow

```
[Profile screen — "Complete KYC" button]
        │  POST /drivers/kyc/verify        (Bearer token, empty body)
        ▼
   { redirectUrl }
        │
        │  open redirectUrl in a WebView
        ▼
[Signzy DigiLocker — driver consents, enters Aadhaar OTP]
        │
        ├──────────► Signzy POSTs the result to our backend ──► driver.isKycCompleted updated
        │            (server-to-server, ~instant, app never sees it)
        │
        ▼  after ~5s Signzy redirects the WebView to the success/failure URL
[App detects the redirect → close WebView]
        │
        │  GET /drivers/me   (poll a few times)
        ▼
   isKycCompleted: true  → verified ✅      |  still false after retries → show "pending / try again"
```

---

## Step 1 — Start KYC

**`POST /api/v3/drivers/kyc/verify`** · Bearer token · body `{ phoneNumber }`

### Success — `200`

```json
{ "redirectUrl": "https://signzy.../digilocker/session/abc123" }
```

Open `redirectUrl` immediately — sessions are short-lived. Generate a **fresh
URL every time** the driver taps the button; never cache or reuse one.

### Errors

| Status | Body | Handling |
| ------ | ---- | -------- |
| `401` | `{ "error": "Not authorized, no token" }` / `"...token failed"` | Send back to login |
| `403` | `{ "error": "Forbidden: insufficient permissions" }` | A rider token was used |
| `502` | `{ "error": "KYC provider did not return a URL" }` | Provider issue — "Verification is unavailable right now, please try again later" |
| `500` | `{ "error": "Unable to proceed with kyc" }` | Same treatment as `502` |

```js
const res = await fetch(`${BASE_URL}/drivers/kyc/verify`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber }),
});
const data = await res.json();
if (!res.ok) return showError("Couldn't start verification. Please try again.");
openKycWebView(data.redirectUrl);
```

---

## Step 2 — Show the DigiLocker screen

Open `redirectUrl` in an **in-app WebView** (`react-native-webview`) rather than
an external browser — you need to observe the redirect to know when the driver
is done, and an external browser gives you no callback.

The driver will consent to DigiLocker, enter their Aadhaar number and an OTP.
Nothing on this screen is under your control.

WebView requirements:

- JavaScript enabled, cookies/DOM storage on (`javaScriptEnabled`,
  `domStorageEnabled`, `thirdPartyCookiesEnabled` on Android).
- Let the driver cancel — provide a close/back control. Treat cancel as "KYC not
  completed" and leave the profile unchanged.
- Don't auto-close on the first navigation; the flow spans several pages.

---

## Step 3 — Detect the finish

When the flow ends, Signzy waits ~5 seconds and then redirects the WebView to a
backend-configured URL:

| Outcome | Redirects to |
| ------- | ------------ |
| Success | `SIGNZY_SUCCESS_URL` |
| Failure / cancel | `SIGNZY_FAILURE_URL` |

⚠️ **These are backend env values, not constants you can hard-code safely** — they
differ per environment (currently both point at the marketing site,
`https://bharatyaatri.com/`). Ask backend for the exact values for each build, or
ask them to expose the pair in an app-config endpoint. Because success and
failure may resolve to the **same** URL, do not infer the outcome from *which*
URL was hit — always confirm with step 4.

```js
<WebView
  source={{ uri: redirectUrl }}
  onNavigationStateChange={(nav) => {
    if (nav.url.startsWith(KYC_REDIRECT_HOST)) {
      closeWebView();
      pollKycStatus();     // step 4 decides success/failure
    }
  }}
/>
```

---

## Step 4 — Confirm the result

There is **no dedicated KYC-status endpoint**. Read the driver profile:

**`GET /api/v3/drivers/me`** · Bearer token

```json
{
  "_id": "66f0c1...",
  "name": "Ramesh Kumar",
  "isKycCompleted": true,
  "kycDetails": {
    "requestId": "req_abc123",
    "status": "success",
    "adharFileId": "file_xyz789",
    "aadhaarJpeg": "<provider-supplied value>"
  }
}
```

| Field | Meaning |
| ----- | ------- |
| `isKycCompleted` | **The only flag your UI should branch on.** `true` only when the provider reported `success` |
| `kycDetails.status` | Raw provider status (`"success"` or a failure string) — useful in support logs |
| `kycDetails.requestId` | Provider reference. Show it on the failure screen so support can trace the attempt |
| `kycDetails.adharFileId` | Internal reference. Don't display |
| `kycDetails.aadhaarJpeg` | Provider-supplied Aadhaar image value. **Don't render it** — the format isn't guaranteed and it's sensitive |

### Poll, don't check once

The redirect and the server-to-server callback race each other. Checking once,
immediately, will often report `false` for a KYC that succeeded moments later.

```js
const pollKycStatus = async () => {
  for (const delay of [0, 2000, 3000, 5000, 5000]) {   // ~15s total
    if (delay) await sleep(delay);
    const me = await fetch(`${BASE_URL}/drivers/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    setProfile(me);
    if (me.isKycCompleted) return showSuccess();
  }
  showPending();   // not "failed" — see below
};
```

If it's still `false` after the retries, show a **neutral pending state**
("Verification is still processing — check back shortly" with a Retry action),
not a hard failure. Re-check when the driver next opens the app.

---

## Displaying KYC state

Drive the whole UI off `isKycCompleted` from `GET /drivers/me`:

| `isKycCompleted` | Profile badge | Action |
| ---------------- | ------------- | ------ |
| `false` | "KYC pending" | Show the **Complete KYC** button |
| `true` | "Verified ✅" | Hide the button; don't offer re-verification |

Refresh the profile on app launch and after returning from the KYC WebView — a
driver may have completed KYC on another device.

---

## Pre-signup KYC (by phone number)

When `/auth/verify` accepts the OTP but reports `userStatus: 404`, there is no
account and therefore no token — yet KYC is what **creates** the driver record,
so it runs before registration. The app sends the driver to the KYC screen with
the phone number and everything below is keyed on it.

### Start — `POST /api/v3/drivers/kyc/verify`

The same endpoint as the profile flow, minus the `Authorization` header. Body:

```json
{ "phoneNumber": "9876543210" }
```

Returns `{ "redirectUrl": "..." }`. Same rules: open it immediately, never reuse
a session.

### Confirm — `GET /api/v3/drivers/kyc/status/:phoneNumber`

No auth. **Not yet created** — the callback hasn't landed, or the driver never
finished:

```json
{ "kycStatus": "not_found", "message": "Driver not found" }
```

This is a normal waiting state, **not** an error — keep counting down and check
again. Once the record exists:

```json
{
  "driverId": "66f0c1...",
  "isKycCompleted": true,
  "kycDetails": { "requestId": "req_abc123", "status": "success" },
  "kycFailedReason": null,
  "token": "<session token>"
}
```

| Field | Meaning |
| ----- | ------- |
| `isKycCompleted` | `true` → verified. Show **Next** |
| `kycFailedReason` | Non-empty → verification failed, in words meant for the driver. Show it and offer **Re-do KYC** |
| neither set | Still processing — keep polling |
| `token` | Session token for the new driver record. **Only sent when `isKycCompleted` is true** — a failed or pending KYC has no token |

### The confirmation window

After the WebView hits the redirect URL the app closes it and shows a **10-second
circular countdown** ("Processing your KYC") while polling at `t = 0s, 5s, 10s`.
Only a verified or a failed result ends it early; `not_found` just keeps the
timer running. If the window closes with neither, fall back to the same neutral
"still processing" state the profile flow uses — with Retry and Contact Support —
never a hard failure.

---

## Errors & edge cases

### The driver's Aadhaar is already linked to another account

One Aadhaar document can only belong to one driver. If the same Aadhaar is used
on a second account, the backend rejects the callback with `409`.

**Signzy receives that rejection — your app does not.** From the app's side it
simply looks like KYC never completes: the redirect happens, but
`isKycCompleted` stays `false` forever.

So your "pending" state must offer a way out — a **Contact Support** link with
the `kycDetails.requestId` if present. Otherwise a driver in this situation is
stuck retrying with no explanation.

> This is a known rough edge. If you need the app to show a proper "this Aadhaar
> is already registered" message, ask backend to surface the failure reason on
> the driver record.

### The driver abandons the flow

Closing the WebView early leaves `isKycCompleted: false` and no `kycDetails`.
Nothing to clean up — they can tap **Complete KYC** again for a fresh URL.

### Repeated attempts

Starting KYC again is safe and always issues a new session. There's no attempt
limit in the API, but debounce the button so a double-tap doesn't open two
WebViews.

---

## Endpoint summary

| Method | Path | Auth | Body | Who calls it |
| ------ | ---- | ---- | ---- | ------------ |
| `POST` | `/drivers/kyc/verify` | Bearer (driver) | `{ phoneNumber }` | **The app** (profile flow) |
| `GET` | `/drivers/me` | Bearer (driver) | — | **The app** (poll for `isKycCompleted`) |
| `POST` | `/drivers/kyc/verify` | none | `{ phoneNumber }` | **The app** (pre-signup flow) |
| `GET` | `/drivers/kyc/status/:phoneNumber` | none | — | **The app** (poll before an account exists) |
| `POST` | `/drivers/kyc/callback/:driverId` | none | Signzy payload | **Signzy only — never the app** |

## Gotchas

1. **`POST /drivers/kyc/verify` needs `{ phoneNumber }`** in the body, token or
   no token.
2. **The redirect ≠ success.** Always confirm with a status read.
3. **Success and failure redirect URLs may be identical** — don't branch on them.
   Match them on **host**, not as a raw string prefix: a trailing slash, a query
   string or a `www.` would otherwise slip past and leave the WebView open.
4. **Poll with backoff.** A single immediate check races the provider callback.
5. **Never call the `/kyc/callback/` endpoint.** It's an unauthenticated webhook
   for Signzy; calling it from the app would be both wrong and a security issue
   to report rather than use.
6. **Don't render `aadhaarJpeg`.** It's sensitive and its format isn't contractual.
7. **Get the redirect URLs from backend per environment** rather than hard-coding
   the production value.
