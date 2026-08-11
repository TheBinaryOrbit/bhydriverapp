# Install Attribution — Meta SDK + Play Install Referrer

Where an install came from — a Facebook ad, a WhatsApp forward, an Instagram bio
link — recorded on our own backend, and which of those installs became an
account.

Related: [Driver Auth & Onboarding](./driver-auth-onboarding.md)

---

## Two independent signals

They do different jobs and neither replaces the other.

| | Meta SDK (`react-native-fbsdk-next`) | Play Install Referrer → this API |
|---|---|---|
| Reports to | Meta's Ads Manager | our database |
| Sees | Meta-driven installs and app events | **every** install, Meta or not |
| Needed for | ad optimisation, cost-per-install | our own source breakdown, install→signup conversion |

The Meta side is app-only configuration — App ID `2243719609387953`, the client
token, `Settings.setAdvertiserTrackingEnabled(true)`, and
`AppEventsLogger.logEvent('CompleteRegistration')` at signup. **The App Secret
never ships in the app.** No backend work, nothing below applies to it.

Everything else on this page is the second column.

**In this app:** `services/metaEvents.ts` is the first column,
`services/installReferrer.ts` the second.

---

## Endpoints

Base: `{BASE_URL}/api/v3/install-referrers`

| Method | Path | Auth | Who calls it |
|---|---|---|---|
| `POST` | `/` | none | the app, once, on first launch after install |
| `POST` | `/link` | `Bearer <jwt>` | the app, once, right after signup completes |
| `GET` | `/` | `x-admin-key` | us |
| `GET` | `/summary` | `x-admin-key` | us |

`POST /` is deliberately public: it fires before any account exists, so there is
nothing to authenticate as. That makes it spoofable in principle — this data is
marketing signal, and nothing that pays out or grants access may ever read from
it.

---

## 1. Record the install

```
POST /api/v3/install-referrers
Content-Type: application/json
```

```json
{
  "referrer": "utm_source=whatsapp&utm_medium=social&utm_campaign=launch",
  "install_time": 1754976000,
  "device_id": "a1b2c3d4e5f6",
  "app": "user",
  "platform": "android",
  "app_version": "1.4.2",
  "referrer_click_time": 1754975000
}
```

| Field | Required | From | Notes |
|---|---|---|---|
| `referrer` | ✅ | `info.installReferrer` | stored raw, exactly as sent |
| `install_time` | ✅ | `info.installBeginTimestampSeconds` | UNIX **seconds** (ms is accepted and converted) |
| `device_id` | — | any stable per-install id the app has | **send it** — see below |
| `app` | — | | `user` \| `driver`, default `user` |
| `platform` | — | | `android` \| `ios`, default `android` |
| `app_version` | — | | |
| `referrer_click_time` | — | `info.referrerClickTimestampSeconds` | click→install gap |

camelCase is accepted for every field too (`install_time` / `installTime` /
`installBeginTimestampSeconds` all work), so the app can post the Play payload
with whatever casing is convenient.

**Responses**

| Status | Meaning |
|---|---|
| `201` | recorded — `{ "created": true, "data": { … } }` |
| `200` | this device already had a row; nothing changed — `{ "created": false, … }` |
| `400` | `{ "message": "Install referrer is invalid", "errors": [{ "field", "message" }] }` |

A repeat post is **200, not an error**, so a retry after a dropped connection is
simply a success. Nothing is overwritten: the *first* referrer we saw is the one
that explains the install, and a later post for the same device — a reinstall, a
restored backup, or anything malicious — cannot replace it.

### Why `device_id` matters

It is the dedupe key, and the only link between an install and the account that
later signs up on that phone. Without it:

- the app's own first-launch flag is the *only* thing stopping duplicate rows,
  and a reinstall or a cleared flag will create a second one;
- `POST /link` cannot work at all, so `signups` in the summary stays at 0.

One row is kept per `(device_id, app)` — a phone can legitimately install both
the rider and the driver app, from two different campaigns.

**In this app** it is `storage/deviceStorage.ts`, and it is deliberately outside
`authStorage`: `clearSession` must not wipe it, or a sign-out would look like a
new install.

### App side

Guard on a persisted flag so this runs exactly once — see
`services/installReferrer.ts`, which posts on the first launch that manages it
and no-ops on every launch after.

Android only — the Play Install Referrer API does not exist on iOS, so don't
call it there.

---

## 2. Link the signup

```
POST /api/v3/install-referrers/link
Authorization: Bearer <jwt>

{ "device_id": "a1b2c3d4e5f6" }
```

Call this once, immediately after a signup completes, from the same device that
posted the referrer — alongside
`AppEventsLogger.logEvent('CompleteRegistration')`. In this app both happen when
`/drivers/onboard` returns, in `DriverOnboardingScreen`.

The account is taken from the JWT, never from the body, and the role in the
token decides whether the row's `userId` or `driverId` is set.

| Status | Meaning |
|---|---|
| `200` `{ "linked": true, "data": {…} }` | attached |
| `200` `{ "linked": false }` | no referrer row for this device — normal for installs that predate this feature |
| `400` | `device_id` missing |
| `401` | bad or missing token |

---

## 3. Reading it back

Both require the `x-admin-key` header.

**`GET /?app=user&source=whatsapp&from=2026-08-01&to=2026-08-31&linked=false&limit=50&skip=0`**

Filters: `app`, `source`, `medium`, `campaign`, `linked` (`true`/`false` — did
this install ever become an account), plus `date` for a single day or
`from`/`to` for a range. A bare `YYYY-MM-DD` means that calendar day in IST, the
same as every other date filter in this API. Sorted by `installTime`, newest
first; `limit` defaults to 50 and caps at 200. Linked accounts are populated with
name and phone number.

**`GET /summary?app=user&from=2026-08-01&to=2026-08-31`**

```json
{
  "totalInstalls": 412,
  "totalSignups": 187,
  "count": 4,
  "data": [
    { "source": "facebook", "medium": "paid", "installs": 240, "signups": 121, "lastInstallAt": "..." },
    { "source": "whatsapp", "medium": "social", "installs": 96, "signups": 48, "lastInstallAt": "..." },
    { "source": "google-play", "medium": "organic", "installs": 64, "signups": 15, "lastInstallAt": "..." },
    { "source": "unknown", "medium": "unknown", "installs": 12, "signups": 3, "lastInstallAt": "..." }
  ]
}
```

`installs` vs `signups` per source is the number Ads Manager cannot give us: it
knows a campaign drove installs, only we know which of those installs became a
rider or a driver.

`source: "unknown"` is a referrer that carried no `utm_source` — Meta's own ad
payload often does not. Those rows are counted, not dropped, so the totals stay
honest; the raw `referrer` string is on every row if a specific one needs
decoding.

---

## What is stored

Collection `installreferrers`, one row per install:

- `referrer` — the raw string, the record
- `installTime`, `referrerClickTime`
- `source`, `medium`, `campaign`, `content`, `term` — parsed from the referrer.
  `source` and `medium` are lower-cased so "WhatsApp" and "whatsapp" don't split
  a report in two; campaign names are kept exactly as written.
- `deviceId`, `app`, `platform`, `appVersion`
- `userId` / `driverId` — null until `/link` is called

The parsed fields exist so a report is an index scan instead of a string search.
If the parse is ever found to be wrong, the raw `referrer` is still there to
re-derive from.
