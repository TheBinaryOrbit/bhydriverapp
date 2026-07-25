# Driver Login & Onboarding — Frontend Guide

Everything the driver app needs for: **send OTP → verify OTP → log in (account
exists) or register (account doesn't exist)**.

- **Base URL:** `http://localhost:5000/api/v3` (dev) — swap the host per env.
- All requests are JSON (`Content-Type: application/json`) **except** the
  onboarding call, which is `multipart/form-data`.
- No auth header is needed for any step below; the JWT is what you *receive* at
  the end.

---

## Flow at a glance

```
[Phone number screen]
        │  POST /auth/otp  { phoneNumber }
        ▼
   { sessionId }  ──────────────► keep in memory for the next call
        │
[OTP screen]
        │  POST /auth/verify  { phoneNumber, otp, sessionId, fcmToken, role: "driver" }
        ▼
   HTTP 200 ─┬─ userStatus: 200  → account exists  → save `token` → Home
             └─ userStatus: 404  → no account yet  → Registration screens
                                                          │
                                    POST /drivers/onboard │ (multipart)
                                                          ▼
                                              HTTP 201 { token, driver, vehicle }
                                                     save `token` → Home
```

> **Important:** a wrong/expired OTP is `400`. `userStatus: 404` inside a `200`
> response is **not an error** — the OTP was correct, the driver just isn't
> registered yet. Don't show an error toast for it.

---

## Step 1 — Send the OTP

**`POST /api/v3/auth/otp`**

```json
{ "phoneNumber": "9876543210" }
```

10-digit number, no `+91`, no spaces.

### Responses

| Status | Body | What to do |
| ------ | ---- | ---------- |
| `200` | `{ "message": "OTP sent successfully.", "sessionId": "e1f2..." }` | Store `sessionId`, go to the OTP screen |
| `400` | `{ "error": "Phone number is required." }` | Validate before sending |
| `503` | `{ "error": "Failed to send OTP. Service unavailable." }` | Show "Couldn't send OTP, try again" + Resend button |
| `500` | `{ "error": "Internal Server Error" }` | Generic retry |

**Notes**

- `sessionId` is the handle for this OTP attempt — it is **required** in step 2.
- Resending an OTP calls this endpoint again and returns a **new** `sessionId`.
  Always overwrite the old one; verifying against a stale `sessionId` fails.
- OTP length is server-configured (`OTP_DIGIT_LENGTH`, 4 or 6). Ask backend
  which is set per environment before hard-coding the input boxes.

```js
const { sessionId } = await fetch(`${BASE_URL}/auth/otp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber }),
}).then((r) => r.json());
```

---

## Step 2 — Verify the OTP

**`POST /api/v3/auth/verify`**

```json
{
  "phoneNumber": "9876543210",
  "otp": "123456",
  "sessionId": "e1f2...",
  "fcmToken": "fcm-device-token",
  "role": "driver"
}
```

| Field | Required | Notes |
| ----- | -------- | ----- |
| `phoneNumber` | ✅ | Same number used in step 1 |
| `otp` | ✅ | What the driver typed |
| `sessionId` | ✅ | From step 1 |
| `role` | ✅ | **`"driver"`** for the driver app (`"user"` is the rider app) |
| `fcmToken` | ❌ | Push token. If omitted, the stored one is kept |

### Response A — account exists (`200`)

```json
{
  "message": "OTP verified successfully.",
  "userStatus": 200,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "driver",
  "user": {
    "_id": "66f0c1...",
    "name": "Ramesh Kumar",
    "phoneNumber": "9876543210",
    "email": "ramesh@example.com",
    "profileImageUrl": "http://localhost:5000/uploads/profileImage-1727...jpg",
    "dob": "1990-04-12T00:00:00.000Z",
    "gender": "male",
    "address": "Patna, Bihar",
    "aadharCardNumber": "123412341234",
    "dlDetails": {
      "dlNumber": "BR01 20200001234",
      "dlFrontImageUrl": "http://localhost:5000/uploads/dlFrontImage-...jpg",
      "dlBackImageUrl": "http://localhost:5000/uploads/dlBackImage-...jpg"
    },
    "fcmToken": "fcm-device-token",
    "isKycCompleted": false,
    "kycDetails": {},
    "createdAt": "2025-09-24T09:12:00.000Z",
    "updatedAt": "2025-09-24T09:12:00.000Z"
  }
}
```

➡️ Persist `token` (secure storage), navigate to Home. `user` is the full driver
profile — the `user` key is shared with the rider app, but for `role: "driver"`
it's a **Driver** document.

### Response B — OTP correct, no account (`200`)

```json
{
  "message": "OTP verified successfully, but account not found.",
  "userStatus": 404
}
```

➡️ Navigate to the **registration flow** (step 3 + 4). There is **no token** in
this response.

⚠️ Keep the verified `phoneNumber` in app state — you must send it to the
onboarding endpoint. The phone number is *not* re-verified there, so don't let
the user edit it after this point.

### Error responses

| Status | Body | Meaning |
| ------ | ---- | ------- |
| `400` | `{ "message": "All fields are required", "errors": [{ "field": "otp", "message": "OTP is required" }] }` | Missing field — map `errors[].field` to your inputs |
| `400` | `{ "message": "Role must be one of: 'user', 'driver'" }` | Bad/absent `role` |
| `400` | `{ "error": "Invalid or expired OTP." }` | Wrong OTP or stale `sessionId` — show inline error, offer Resend |
| `500` | `{ "error": "Internal Server Error" }` | Generic retry |

### Branching logic

```js
const res = await fetch(`${BASE_URL}/auth/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber, otp, sessionId, fcmToken, role: 'driver' }),
});
const data = await res.json();

if (!res.ok) {
  showError(data.error ?? data.message);   // 400 / 500
} else if (data.userStatus === 200) {
  await saveToken(data.token);             // existing driver
  goToHome(data.user);
} else {
  goToRegistration({ phoneNumber });       // userStatus === 404
}
```

---

## Step 3 — Load vehicle types (registration prerequisite)

Registration requires the driver to pick a vehicle type, so fetch the list to
render the picker.

**`GET /api/v3/vehicle-types`** (public)

```json
{
  "count": 2,
  "data": [
    {
      "_id": "66f0aa...",
      "slug": "bharat_mini",
      "name": "Bharat Mini",
      "description": "Hatchback, 4 seats",
      "capacity": 4,
      "ratePerKm": 12,
      "ratePerMinute": 1.5,
      "baseFare": 40,
      "icon": "http://localhost:5000/uploads/icon-...png",
      "isActive": true
    }
  ]
}
```

Render only entries with `isActive: true`. Send back either the `_id` **or** the
`slug` as `vehicleTypeId` — the backend accepts both.

---

## Step 4 — Create the driver account

One multipart call creates the **driver + their first vehicle** and returns the
JWT. There is no separate "create vehicle" step during signup.

**`POST /api/v3/drivers/onboard`**
**`Content-Type: multipart/form-data`** (no auth header)

### Text fields

| Field | Required | Notes |
| ----- | -------- | ----- |
| `name` | ✅ | Driver's full name |
| `phoneNumber` | ✅ | The **verified** number from step 2 |
| `vehicleTypeId` | ✅ | `_id` or `slug` from step 3 |
| `vehicleNumber` | ✅ | e.g. `BR01AB1234` — stored uppercase, must be globally unique |
| `email` | ❌ | Lowercased; unique if provided |
| `dob` | ❌ | Date string, e.g. `1990-04-12` |
| `gender` | ❌ | `male` \| `female` \| `other` (case-insensitive) |
| `address` | ❌ | Free text |
| `aadharCardNumber` | ❌ | Unique if provided |
| `dlNumber` | ❌ | Unique if provided |

| `vehicleName` | ❌ | e.g. `Maruti Swift` |
| `ownerName` | ❌ | If the vehicle isn't in the driver's name |
| `seatingCapacity` | ❌ | Number |
| `manufactureYear` | ❌ | Number, e.g. `2019` |
| `insuranceExpiryMonth` | ❌ | Number `1`–`12` |
| `insuranceExpiryYear` | ❌ | Number, e.g. `2026` |

### File fields

All optional; **jpeg / jpg / png / webp only, max 5 MB each**.

| Field | Max files | Purpose |
| ----- | --------- | ------- |
| `profileImage` | 1 | Driver photo |
| `dlFrontImage` | 1 | Driving licence — front |
| `dlBackImage` | 1 | Driving licence — back |
| `vehicleImages` | 3 | Vehicle photos (front / side / back) — repeat the same field name |
| `rcFrontImage` | 1 | RC — front |
| `rcBackImage` | 1 | RC — back |

### Success — `201`

```json
{
  "message": "Driver onboarded successfully.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "driver",
  "driver": { "_id": "66f0c1...", "name": "Ramesh Kumar", "phoneNumber": "9876543210", "...": "..." },
  "vehicle": {
    "_id": "66f0c2...",
    "driverId": "66f0c1...",
    "vehicleTypeId": "66f0aa...",
    "vehicleNumber": "BR01AB1234",
    "vehicleImages": ["http://localhost:5000/uploads/vehicleImages-...jpg"],
    "rcDetails": { "frontImageUrl": "...", "backImageUrl": "" },
    "insuranceExpiry": { "month": 6, "year": 2026 }
  }
}
```

➡️ Save `token` exactly as in step 2 and go to Home. **No second login call is
needed after registering.**

### Error responses

| Status | Body | Handling |
| ------ | ---- | -------- |
| `400` | `{ "message": "All required fields must be provided", "errors": [{ "field": "vehicleNumber", "message": "Vehicle number is required" }] }` | Highlight fields from `errors[]` |
| `400` | `{ "message": "Gender is invalid", "errors": [...] }` | Restrict gender to the 3 allowed values |
| `400` | `{ "error": "Only image (jpeg, jpg, png, webp) files are allowed" }` | Filter file picker by type |
| `404` | `{ "message": "Vehicle type not found" }` | Refresh the vehicle-type list |
| `409` | `{ "message": "Phone number already registered" }` | Account was created meanwhile → send back to login |
| `409` | `{ "message": "A vehicle with this number already exists" }` | Ask for a different vehicle number |
| `409` | `{ "message": "Email already registered", "errors": [{ "field": "email", "message": "Email already exists" }] }` | Also fires for `aadharCardNumber`, `dlDetails.dlNumber` |
| `500` | `{ "error": "Failed to onboard driver", "message": "Internal server error" }` | Generic retry |

The call is **atomic**: if vehicle creation fails, the just-created driver is
deleted, so a failed request never leaves a half-registered account. Safe to
retry the whole form.

### Example

```js
const form = new FormData();
form.append('name', name);
form.append('phoneNumber', phoneNumber);      // verified in step 2
form.append('vehicleTypeId', selectedType._id);
form.append('vehicleNumber', vehicleNumber);
if (email) form.append('email', email);
if (gender) form.append('gender', gender);
if (profileImage) form.append('profileImage', profileImage);
vehiclePhotos.forEach((f) => form.append('vehicleImages', f)); // up to 3

const res = await fetch(`${BASE_URL}/drivers/onboard`, { method: 'POST', body: form });
const data = await res.json();
if (res.status === 201) {
  await saveToken(data.token);
  goToHome(data.driver);
}
```

> Don't set `Content-Type` manually for `FormData` — the boundary must be
> generated by the HTTP client.

---

## Using the token

Send it on every protected request:

```
Authorization: Bearer <token>
```

- Lifetime is server-configured (`JWT_EXPIRES_IN`, default `7d`).
- On `401` (`{ "error": "Not authorized, token failed" }` or
  `"Not authorized, no token"`), clear stored credentials and send the driver
  back to the phone-number screen.
- `403 { "error": "Forbidden: insufficient permissions" }` means a driver-only
  route was hit with a rider token — shouldn't happen if `role: "driver"` was
  used at verify.

Fetch the logged-in driver at any time:

**`GET /api/v3/drivers/me`** (Bearer token) → the full Driver object, same shape
as `user` in step 2. Use it on app launch to refresh the cached profile and to
check `isKycCompleted`.

---

## Gotchas

1. **`userStatus` lives inside a `200`.** Branch on `data.userStatus`, not on
   the HTTP status, after a successful verify.
2. **`sessionId` is single-use per OTP send.** Every Resend replaces it.
3. **Phone number must not change between verify and onboard.** `/drivers/onboard`
   trusts the number you send; it does not re-check the OTP.
4. **`fcmToken` is only stored by `/auth/verify`.** The onboarding call ignores
   it, so a brand-new driver has an empty `fcmToken` until their next OTP login.
   If push must work immediately after signup, ask backend to accept `fcmToken`
   on `/drivers/onboard`.
5. **Image URLs are absolute** (`http://host/uploads/<file>`) — render directly,
   don't prefix with the API base.
6. **Test numbers:** `6203821043` and `6203821044` accept OTP `123456` without a
   real SMS. Handy for QA; scheduled for removal before production.
7. **KYC is separate from signup.** After login, `POST /api/v3/drivers/kyc/verify`
   (Bearer token) returns `{ redirectUrl }` for the DigiLocker flow; poll
   `/drivers/me` afterwards for `isKycCompleted`.
