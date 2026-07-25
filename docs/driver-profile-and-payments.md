# Driver Profile, Vehicle, Payments & Content Pages — Frontend Guide

Everything the driver app needs **after login**: edit personal info, edit vehicle
details, save payment (UPI) details, and load the Help & Support / About /
Privacy / Terms pages.

For login and registration, see [Driver Login & Onboarding](./driver-auth-onboarding.md).

- **Base URL:** `http://localhost:5000/api/v3` (dev) — swap the host per env.
- **Every endpoint here except the content pages needs the JWT:**
  ```
  Authorization: Bearer <token>
  ```
- On `401` (`{ "error": "Not authorized, token failed" }`), clear stored
  credentials and send the driver back to the login screen.
- `403 { "error": "Forbidden: insufficient permissions" }` means a rider token
  was used on a driver-only route.

> **The driver is always taken from the token.** No endpoint here accepts a
> driver id in the body or URL — you cannot (and don't need to) send one.

---

## 1. Personal information

### 1a. Read the profile

**`GET /api/v3/drivers/me`** — Bearer token

Returns the full Driver object. Use it on app launch / when opening the Profile
screen so the form is pre-filled with server truth.

```json
{
  "_id": "66f0c1...",
  "name": "Ramesh Kumar",
  "phoneNumber": "9876543210",
  "email": "ramesh@example.com",
  "profileImageUrl": "http://localhost:5000/uploads/profileImage-...jpg",
  "dob": "1990-04-12T00:00:00.000Z",
  "gender": "male",
  "address": "Patna, Bihar",
  "aadharCardNumber": "123412341234",
  "dlDetails": {
    "dlNumber": "BR01 20200001234",
    "dlFrontImageUrl": "http://localhost:5000/uploads/dlFrontImage-...jpg",
    "dlBackImageUrl": "http://localhost:5000/uploads/dlBackImage-...jpg"
  },
  "fcmToken": "...",
  "isKycCompleted": false,
  "kycDetails": {},
  "createdAt": "2026-07-25T08:00:00.000Z",
  "updatedAt": "2026-07-25T08:10:00.000Z"
}
```

`dob` comes back as a full ISO timestamp — take the first 10 characters for a
date picker (`"1990-04-12T00:00:00.000Z".slice(0, 10)`).

### 1b. Edit the profile

**`PATCH /api/v3/drivers/me`**
**`Content-Type: multipart/form-data`** · Bearer token

**Partial update — send only the fields the driver actually changed.** Any field
you omit is left untouched. Sending an empty request is a `400`.

#### Editable text fields

| Field | Notes |
| ----- | ----- |
| `name` | Cannot be set to an empty string |
| `email` | Lowercased; must be unique across drivers |
| `dob` | `YYYY-MM-DD`; must be a valid date |
| `gender` | `male` \| `female` \| `other` (case-insensitive, stored lowercase) |
| `address` | Free text |
| `aadharCardNumber` | Unique across drivers |
| `dlNumber` | Unique across drivers; maps to `dlDetails.dlNumber` |

#### Editable file fields

jpeg / jpg / png / webp, max 5 MB each. Uploading one **replaces** that image.

| Field | Replaces |
| ----- | -------- |
| `profileImage` | `profileImageUrl` |
| `dlFrontImage` | `dlDetails.dlFrontImageUrl` |
| `dlBackImage` | `dlDetails.dlBackImageUrl` |

#### Not editable here

| Field | Why |
| ----- | --- |
| `phoneNumber` | It's the login identity — changing it needs a fresh OTP flow. Show it read-only (greyed out) |
| `isKycCompleted`, `kycDetails` | Set only by the KYC flow |
| `fcmToken` | Refreshed automatically on each OTP login |

#### Success — `200`

```json
{
  "message": "Profile updated successfully.",
  "driver": { "_id": "66f0c1...", "name": "Updated Name", "...": "..." }
}
```

The full updated driver comes back — replace your cached profile with
`response.driver` rather than patching it locally.

#### Errors

| Status | Body | Handling |
| ------ | ---- | -------- |
| `400` | `{ "message": "No fields to update" }` | Nothing changed — disable Save until the form is dirty |
| `400` | `{ "message": "Name is invalid", "errors": [{ "field": "name", ... }] }` | Name was blank/whitespace |
| `400` | `{ "message": "Date of birth is invalid", "errors": [{ "field": "dob", ... }] }` | Send `YYYY-MM-DD` |
| `400` | `{ "message": "Gender is invalid", "errors": [{ "field": "gender", ... }] }` | Use the 3-option picker |
| `400` | `{ "error": "Only image (jpeg, jpg, png, webp) files are allowed" }` | Filter the file picker |
| `409` | `{ "message": "Email already registered", "errors": [{ "field": "email", "message": "Email already exists" }] }` | Also fires for `aadharCardNumber` and `DL number` |
| `500` | `{ "error": "Failed to update profile", "message": "Internal server error" }` | Generic retry |

#### Example — send only what changed

```js
const form = new FormData();
if (dirty.name) form.append('name', values.name);
if (dirty.gender) form.append('gender', values.gender);       // 'male' | 'female' | 'other'
if (dirty.dob) form.append('dob', values.dob);                // 'YYYY-MM-DD'
if (newPhoto) form.append('profileImage', newPhoto);

const res = await fetch(`${BASE_URL}/drivers/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}` },   // no Content-Type — FormData sets it
  body: form,
});
const data = await res.json();
if (res.ok) setProfile(data.driver);
```

> Never set `Content-Type` yourself on a `FormData` request — the multipart
> boundary must come from the HTTP client.

---

## 2. Vehicle details

### 2a. Read the driver's vehicles

**`GET /api/v3/vehicles/my`** — Bearer token

Only the signed-in driver's vehicles. `vehicleTypeId` comes back **populated**
with the full type object, so you can render the name and icon directly.

```json
{
  "count": 1,
  "data": [
    {
      "_id": "66f0c2...",
      "driverId": "66f0c1...",
      "vehicleTypeId": {
        "_id": "6a646d15a0c99ec524bb362c",
        "slug": "bharat_mini",
        "name": "Bharat Mini",
        "capacity": 4,
        "ratePerKm": 8,
        "icon": "https://.../car.png",
        "features": ["AC Available", "Compact Car", "Best for Short Distance"]
      },
      "vehicleNumber": "BR01AB1234",
      "vehicleName": "Maruti Swift",
      "ownerName": "Ramesh Kumar",
      "seatingCapacity": 4,
      "manufactureYear": 2019,
      "insuranceExpiry": { "month": 6, "year": 2027 },
      "vehicleImages": ["http://localhost:5000/uploads/vehicleImages-...jpg"],
      "rcDetails": {
        "frontImageUrl": "http://localhost:5000/uploads/rcFrontImage-...jpg",
        "backImageUrl": ""
      }
    }
  ]
}
```

⚠️ On **edit**, send `vehicleTypeId` back as a plain id string
(`vehicleTypeId._id` or its `slug`) — not the populated object.

### 2b. Edit a vehicle

**`PATCH /api/v3/vehicles/:id`**
**`Content-Type: multipart/form-data`** · Bearer token

`:id` is the vehicle's `_id`. Partial update, same rules as the profile: send
only changed fields; an empty request is a `400`.

**The server verifies the vehicle belongs to the token's driver** — editing
someone else's vehicle is a `403`.

#### Editable text fields

| Field | Notes |
| ----- | ----- |
| `vehicleTypeId` | `_id` **or** `slug` (e.g. `bharat_mini`) from `GET /vehicle-types` |
| `vehicleNumber` | Uppercased server-side; must be globally unique |
| `vehicleName` | e.g. `Maruti Swift` |
| `ownerName` | If the vehicle isn't in the driver's name |
| `seatingCapacity` | Number |
| `manufactureYear` | Number |
| `insuranceExpiryMonth` | `1`–`12` → `insuranceExpiry.month` |
| `insuranceExpiryYear` | e.g. `2027` → `insuranceExpiry.year` |

#### Editable file fields

| Field | Max | Behaviour |
| ----- | --- | --------- |
| `vehicleImages` | 3 | **Replaces the whole array.** To keep an existing photo and add one, re-upload both |
| `rcFrontImage` | 1 | Replaces the front RC image only |
| `rcBackImage` | 1 | Replaces the back RC image only |

#### Success — `200`

```json
{
  "message": "Vehicle updated successfully.",
  "vehicle": { "_id": "66f0c2...", "vehicleName": "Maruti Swift", "...": "..." }
}
```

#### Errors

| Status | Body | Handling |
| ------ | ---- | -------- |
| `400` | `{ "message": "No fields to update" }` | Form wasn't dirty |
| `403` | `{ "error": "Forbidden: this vehicle belongs to another driver" }` | Only edit ids from `GET /vehicles/my` |
| `404` | `{ "message": "Vehicle not found" }` | Bad vehicle id |
| `404` | `{ "message": "Vehicle type not found" }` | Refresh the vehicle-type list |
| `409` | `{ "message": "A vehicle with this number already exists" }` | Number is taken by another vehicle. Re-saving a vehicle's **own** number is fine |
| `500` | `{ "error": "Failed to update vehicle", "message": "Internal server error" }` | Generic retry |

```js
const form = new FormData();
form.append('vehicleName', 'Maruti Swift');
form.append('insuranceExpiryMonth', '6');
form.append('insuranceExpiryYear', '2027');
if (newRcFront) form.append('rcFrontImage', newRcFront);

const res = await fetch(`${BASE_URL}/vehicles/${vehicleId}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

### 2c. Add another vehicle

**`POST /api/v3/vehicles`** · multipart · Bearer token

Same fields as the edit call, but `vehicleTypeId` and `vehicleNumber` are
**required**. Returns `201` with the new vehicle. The driver is taken from the
token. A driver's first vehicle is created during onboarding — use this only to
add a second one.

---

## 3. Payment details (UPI)

One UPI id per driver, used for payouts.

### 3a. Read

**`GET /api/v3/payment-details/my`** — Bearer token

```json
{
  "_id": "6a6473aa...",
  "driverId": "66f0c1...",
  "upiId": "ramesh@okaxis",
  "createdAt": "2026-07-25T08:28:26.265Z",
  "updatedAt": "2026-07-25T08:28:26.265Z"
}
```

**`404 { "message": "Payment details not found" }`** simply means the driver
hasn't added a UPI id yet — show the empty state with an "Add UPI ID" button,
not an error.

### 3b. Add or change

**`POST /api/v3/payment-details`**
**`Content-Type: application/json`** · Bearer token

```json
{ "upiId": "ramesh@okaxis" }
```

This is an **upsert** — the same endpoint adds the first UPI id and replaces an
existing one. There is no separate update call and no `PATCH`/`DELETE`.

#### Success — `201`

```json
{ "_id": "6a6473aa...", "driverId": "66f0c1...", "upiId": "ramesh@okaxis", "...": "..." }
```

Returns `201` on both create and replace — don't treat it as "created" in your UI copy.

#### Errors

| Status | Body | Handling |
| ------ | ---- | -------- |
| `400` | `{ "message": "UPI id is required", "errors": [{ "field": "upiId", ... }] }` | Empty input |
| `400` | `{ "message": "Invalid UPI id", "error": "Validation failed: upiId: Invalid UPI id" }` | Failed the format check — show your own copy, the `error` string is server-speak |
| `500` | `{ "error": "Failed to save payment details", "message": "Internal server error" }` | Generic retry |

#### Validate the UPI id locally first

The server pattern is `^[\w.\-]{2,256}@[a-zA-Z]{2,64}$` — i.e. a handle of at
least 2 characters (letters, digits, `_`, `.`, `-`), an `@`, then a
letters-only bank suffix. `ramesh@okaxis` ✅ · `ramesh@ok.axis` ❌ ·
`ramesh123@ybl` ✅ · `9876543210@paytm` ✅

```js
const UPI_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
if (!UPI_RE.test(upiId.trim())) return showInline('Enter a valid UPI ID, e.g. name@okaxis');
```

---

## 4. Help & Support and other content pages

Static pages (About Us, Privacy Policy, Terms & Conditions, Help & Support) are
served from the API as **HTML**, so they can be updated without an app release.

**No auth header needed.**

### 4a. List the pages — build the menu

**`GET /api/v3/app-content/driver`**

Use `driver` for the driver app (`user` is the rider app — the content differs).

```json
{
  "count": 4,
  "data": [
    { "_id": "6a64...", "slug": "about-us", "name": "About Us", "iconName": "information-outline", "type": "driver", "isActive": true },
    { "_id": "6a64...", "slug": "help-and-support", "name": "Help & Support", "iconName": "help-circle-outline", "type": "driver", "isActive": true },
    { "_id": "6a64...", "slug": "privacy-policy", "name": "Privacy Policy", "iconName": "shield-lock-outline", "type": "driver", "isActive": true },
    { "_id": "6a64...", "slug": "terms-and-conditions", "name": "Terms & Conditions", "iconName": "file-document-outline", "type": "driver", "isActive": true }
  ]
}
```

- **`content` is deliberately excluded from this response** — it's the light list
  for rendering the menu. Fetch the body only when a row is tapped.
- Sorted by `name`. Only active pages are returned, so render whatever you get.
- `iconName` is a **react-native-vector-icons / MaterialCommunityIcons** name —
  map it straight to your icon component, with a sensible fallback for unknown names.
- **Drive the menu off this response.** Don't hard-code the four rows — pages can
  be added, renamed or deactivated server-side.

### 4b. Load one page

**`GET /api/v3/app-content/driver/:idOrSlug`**

Accepts the `_id` or the `slug` — e.g.
`GET /api/v3/app-content/driver/help-and-support`.

```json
{
  "_id": "6a64...",
  "slug": "help-and-support",
  "name": "Help & Support",
  "iconName": "help-circle-outline",
  "type": "driver",
  "content": "<h1>Help &amp; Support</h1><p>We're here to help...</p>",
  "isActive": true,
  "createdAt": "2026-07-25T08:12:00.000Z",
  "updatedAt": "2026-07-25T08:12:00.000Z"
}
```

### Rendering `content`

- It's an **HTML fragment** — `h1`, `h2`, `h3`, `p`, `ul`/`li`, `strong`, `em`, `a`.
  There is no `<html>`, `<head>` or `<body>` wrapper and no CSS.
- Render in a `WebView` (or `react-native-render-html`). For a WebView, wrap it
  yourself so it inherits app styling:
  ```js
  const html = `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:-apple-system,Roboto,sans-serif;font-size:15px;line-height:1.6;
      color:#1a1a1a;padding:16px;margin:0}h1{font-size:20px}h2{font-size:17px;margin-top:24px}
      a{color:#0a58ca}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}</style>
    </head><body>${data.content}</body></html>`;
  ```
- The Help & Support page contains `mailto:` links — intercept link taps and open
  them with `Linking.openURL` instead of navigating the WebView.
- Cache the HTML locally and show the cached copy while re-fetching, so the page
  opens instantly and still works offline.

### Errors

| Status | Body | Meaning |
| ------ | ---- | ------- |
| `400` | `{ "message": "App type must be 'user' or 'driver'" }` | The path segment must be exactly `driver` |
| `404` | `{ "message": "App content not found" }` | Unknown slug, or the page is inactive |
| `500` | `{ "error": "Failed to fetch app content", "message": "Internal server error" }` | Generic retry |

---

## Endpoint summary

| Method | Path | Auth | Body |
| ------ | ---- | ---- | ---- |
| `GET` | `/drivers/me` | Bearer | — |
| `PATCH` | `/drivers/me` | Bearer | multipart |
| `GET` | `/vehicles/my` | Bearer | — |
| `PATCH` | `/vehicles/:id` | Bearer | multipart |
| `POST` | `/vehicles` | Bearer | multipart |
| `GET` | `/payment-details/my` | Bearer | — |
| `POST` | `/payment-details` | Bearer | JSON |
| `GET` | `/app-content/driver` | none | — |
| `GET` | `/app-content/driver/:slug` | none | — |

## Gotchas

1. **PATCH means partial.** Omitted fields keep their old values — you never need
   to resend the whole profile. But a request with *nothing* in it is a `400`.
2. **Uploading an image replaces it.** There's no "delete image" call; to clear
   one, ask backend for it.
3. **`vehicleImages` replaces the entire array**, unlike the single-image fields.
4. **Phone number is read-only** after signup.
5. **`404` on payment details is an empty state**, not an error.
6. **A `409` on profile edit is a *different* driver's data** — email, Aadhaar and
   DL number are unique platform-wide.
7. **Content pages are per app type.** Always fetch the `driver` variant; the
   `user` pages describe rider fares and lost items instead.
