# QuickRide — Driver App Frontend Guide

Everything the driver app needs from "go online" to "ride completed": the socket
events, the REST endpoints, the exact payloads, and every error case worth a
screen.

Related: [Driver Login & Onboarding](./driver-auth-onboarding.md) ·
[Driver KYC](./driver-kyc.md) · [Profile, Vehicle & Payments](./driver-profile-and-payments.md)

- **Base URL:** `http://localhost:5000/api/v3` (dev)
- **Socket URL:** `http://localhost:5000`
- Every REST call below needs a **driver** token: `Authorization: Bearer <token>`

---

## The shape of the whole thing

```
[App opens / returns from background]
   │  GET /quick-rides/live       ← one call: "where was I?"  (see §0)
   ▼
[Home screen]
   │  socket.connect({ auth: { token } })
   │  emit driver:online  { latitude, longitude }      ← requires KYC + a vehicle
   │  emit driver:location every 5s                    ← keeps you discoverable
   ▼
[Live ride cards]  ◄── on 'ride:request'      (a new ride nearby)
   │               ◄── on 'ride:fare_updated' (rider raised the price)
   │               ◄── on 'ride:cancelled' / 'ride:taken' (remove the card)
   │
   │  POST /quick-ride-bids   { quickRideId, fare }
   ▼
[Bid placed — 60s countdown]
   │               ◄── on 'bid:expired'  (nobody accepted, card dies)
   │               ◄── on 'ride:taken'   (another driver won)
   │               ◄── on 'bid:accepted' (YOU won) ──────┐
   ▼                                                     │
[Ride details screen] ◄───────────────────────────────────┘
   │  GET /quick-rides/:id
   │  navigate to PICKUP        (rideStatus 'assigned')
   │
   │  PATCH /quick-rides/:id/start   { startOtp }   ← rider reads the OTP out loud
   ▼
[Trip in progress]
   │  navigate to DROP          (rideStatus 'in_progress')
   │  keep emitting driver:location — the rider's map is fed by it
   │
   │  PATCH /quick-rides/:id/complete
   ▼
[Success screen]  finalFare, completedAt
```

Two rules that explain most of the API:

1. **Identity always comes from the token.** Never send a `driverId` anywhere.
2. **A driver holding a ride in `assigned` or `in_progress` is *busy*.** They
   receive no new ride requests, `GET /available` returns `busy: true`, and
   bidding returns `409`. Completing or cancelling the ride frees them.

---

## 0. Reopening the app — `GET /quick-rides/live`

**Call this first, every time the app opens or comes back from the background.**
It answers "where was I?" in one round trip so you never have to reconstruct the
screen from a ride list plus a bid list plus a status guess.

**`GET /api/v3/quick-rides/live?latitude=<lat>&longitude=<lng>`** · Bearer token

The coordinates are **optional** — send them if GPS is ready, skip them if it
isn't and the call still works. The endpoint is **role-aware**: the same URL
serves the driver app and the rider app, and each gets its own shape.

### Driver, mid-ride — `200`

```json
{
  "role": "driver",
  "busy": true,
  "hasLiveRide": true,
  "rideStatus": "in_progress",
  "navigateTo": "drop",
  "ride": { "...fully populated ride, rider + vehicle type included..." },
  "bids": [],
  "availableRides": []
}
```

Route straight to the details screen. **`navigateTo` is the phase**, computed
server-side — `"pickup"` while `assigned`, `"drop"` once `in_progress` — so the
app does not have to re-derive it. The driver's copy never contains `startOtp`.

### Driver, free — `200`

```json
{
  "role": "driver",
  "busy": false,
  "hasLiveRide": false,
  "ride": null,
  "needsLocation": false,
  "needsVehicle": false,
  "count": 1,
  "bids": [ { "...your still-pending bids, each with the full ride populated..." } ],
  "availableRides": [ { "...open rides, same shape as /available..." } ]
}
```

Show the home screen with the ride cards already populated, and restore the "bid
pending" state from `bids` — that is what stops a driver who reopened the app
from bidding twice on the same ride.

> **`availableRides` are ride *documents*, not socket cards.** Each entry is the
> stored ride keyed **`_id`** — not `rideId` — with the dispatch extras added by
> the query (`bidBounds`, `distanceFromDriverKm`, `distanceFromDriverMeters`).
> The socket's `ride:request` sends the flat card keyed `rideId` instead. Both
> go through `toRideCard` (`src/types/quickRide.ts`) before they reach the list;
> keying off `rideId` alone silently drops every fetched ride on the floor.

```json
{
  "_id": "6a69bdce9c622dd95a92990a",
  "pickupLocationName": "Current location",
  "dropLocationName": "Sector 62 Noida",
  "pickupCoordinates": { "type": "Point", "coordinates": [77.49, 28.75] },
  "estimatedDistanceKm": 32.56,
  "estimatedDurationMin": 65,
  "suggestedFare": 861,
  "offeredFare": 861,
  "rideStatus": "searching",
  "expiresAt": "2026-07-29T08:51:06.576Z",
  "distanceFromDriverKm": 0.05,
  "bidBounds": { "min": 0, "max": 0 }
}
```

| Field | Means |
| --- | --- |
| `needsLocation: true` | You did not send lat/lng. `availableRides` is empty **because of that**, not because there are no rides |
| `needsVehicle: true` | No vehicle registered — send to the add-vehicle screen |
| `bids` | Live bids only; expired ones are already gone |

### Rider — `200`

```json
{
  "role": "user",
  "hasLiveRide": true,
  "rideStatus": "assigned",
  "ride": { "..." },
  "offerBounds": { "min": 366, "max": 687 },
  "bidBounds": { "min": 400, "max": 750 },
  "startOtp": "4821",
  "trackingUrl": "https://.../abc123",
  "count": 2,
  "bids": [ "...live bids on the ride..." ]
}
```

`searching` counts as live for the rider — they are sitting on the bid screen, so
the endpoint returns the ride **and** the bids currently on it. `startOtp` is
non-null only once a driver is assigned, and only ever in the **rider's** copy.

### Nothing in flight — `200`

```json
{ "role": "driver", "busy": false, "hasLiveRide": false, "ride": null, "bids": [], "availableRides": [] }
```

`hasLiveRide: false` with `ride: null` — never a `404`. Arrays are always
arrays, never `null` or absent, so the app can render without guards.

| Status | Body |
| --- | --- |
| `200` | one of the shapes above |
| `401` | `{ error: 'Not authorized, ...' }` — token missing/expired → log out |

---

## 1. Going online — how live rides start arriving

Live rides are pushed over the socket. You get them only if **all** of these hold:

| Requirement | If missing |
| --- | --- |
| Socket connected with a valid driver JWT | handshake fails: `Unauthorized: ...` |
| `driver:online` acknowledged | you are not in the Redis geo index → invisible to dispatch |
| KYC completed | ack `{ ok: false, message: 'Complete your KYC before going online' }` |
| A registered vehicle | ack `{ ok: false, message: 'Register a vehicle before going online' }` |
| A `driver:location` ping within the last **30s** | your entry expires → invisible again |
| The ride's vehicle type == your vehicle's type | you are not offered that ride |
| You are not already on a ride | you are filtered out of dispatch |

### Connect

```js
const socket = io('http://localhost:5000', {
  auth: { token: driverJwt },       // the handshake, NOT a header
  transports: ['websocket'],
});

socket.on('connect_error', (err) => {
  // err.message: 'Unauthorized: Account not found' | 'Unauthorized: jwt expired' | ...
  // → send the driver back to login
});
```

### Go online

```js
socket.emit('driver:online', { latitude: 28.6315, longitude: 77.2167 }, (ack) => {
  if (!ack?.ok) showError(ack?.message);   // KYC / vehicle / invalid coords
  else startLocationPings();
});
```

### Keep pinging — every 5 seconds, always

```js
setInterval(() => {
  socket.emit('driver:location', { latitude, longitude, heading, speed });
}, 5000);
```

This one event does **two** jobs: it keeps you discoverable while you are free,
**and** it feeds the rider's live map once you are on a ride. There is no second
event and no different cadence — do not stop pinging after a ride is assigned.

> Fixes that are invalid, or that imply travel faster than `MAX_LOCATION_JUMP_KMPH`
> (default 200 km/h), are **dropped silently**. No error comes back. If the map
> freezes, suspect bad GPS, not a bug.

### Going offline vs. losing the connection — these are different

| | What happens | Coming back |
| --- | --- | --- |
| `socket.emit('driver:offline')` | Evicted from Redis **immediately** | Must emit `driver:online` again |
| Socket drops (tunnel, lift, app backgrounded, phone sleeps) | Entry is **parked, not deleted**, for `DRIVER_DISCONNECT_GRACE_SECONDS` (**5 min** by default) | Just reconnect — the server restores it |

A dropped socket no longer costs the driver their place. The entry is flagged
offline for the grace window — dispatch skips it, because there is no socket to
deliver a ride to anyway — and their position, vehicle metadata and place in the
geo index are all held for them.

Reconnect inside the window and the server reinstates it automatically:

```js
socket.on('driver:resumed', ({ latitude, longitude, offlineForMs }) => {
  // Already back in the index with the cached vehicle — do NOT emit driver:online.
  // Just resume the 5s location pings.
  startLocationPings();
});
```

| | |
| --- | --- |
| `driver:resumed` **fires** | You were parked and are now live again. Resume pings; skip `driver:online` |
| `driver:resumed` does **not** fire | Either you never went online, or the 5 min window closed. Emit `driver:online` as usual |

Two consequences worth building for:

- **Do not show "you are offline" the moment the socket drops.** The driver has
  5 minutes of grace; a spinner or a subtle "reconnecting…" banner is the honest
  UI. Only show offline after a failed reconnect past the window.
- The position held during the window is the **last one you sent**. It goes stale
  while you are away, which is why the first thing to do after `driver:resumed`
  is send a fresh `driver:location`.

Multi-device is handled: closing one of two connected sessions does not park a
driver who is still connected elsewhere.

---

## 2. Listening for live rides

```js
socket.on('ride:request',      (ride) => upsertRideCard(ride));
socket.on('ride:fare_updated', (ride) => upsertRideCard(ride));  // same full payload
socket.on('ride:cancelled',    ({ rideId }) => removeCard(rideId));
socket.on('ride:taken',        ({ rideId }) => removeCard(rideId));
socket.on('bid:expired',       ({ quickRideId }) => markBidExpired(quickRideId));
socket.on('bid:accepted',      (payload) => openRideDetails(payload.rideId));
```

### `ride:request` payload — and what to put on the card

```json
{
  "rideId": "66f1...",
  "pickupLocationName": "Connaught Place",
  "dropLocationName": "Sector 62 Noida",
  "pickupCoordinates": { "latitude": 28.6315, "longitude": 77.2167 },
  "dropCoordinates":   { "latitude": 28.5355, "longitude": 77.391 },
  "vehicleTypeId": "66e0...",
  "estimatedDistanceKm": 24.31,
  "estimatedDurationMin": 58,
  "suggestedFare": 458,
  "offeredFare": 500,
  "bidBounds": { "min": 400, "max": 750 },
  "expiresAt": "2026-07-29T10:35:00.000Z",
  "distanceFromDriverKm": 1.2
}
```

| Show | From |
| --- | --- |
| Big fare number | `offeredFare` — what the rider is offering |
| "₹400 – ₹750" bid slider range | `bidBounds.min` / `bidBounds.max` |
| "1.2 km away" pickup badge | `distanceFromDriverKm` |
| Pickup → Drop names | `pickupLocationName`, `dropLocationName` |
| "24.3 km · 58 min" trip summary | `estimatedDistanceKm`, `estimatedDurationMin` |
| Countdown on the card | `expiresAt` — **remove the card when it passes** |

`suggestedFare` is the system estimate; show it only if you want a "rider is
offering above/below the estimate" hint. It is not the bidding baseline —
`bidBounds` is.

> **Coordinates come in two shapes.** Socket payloads (`ride:request`) give you
> `{ latitude, longitude }`. REST responses that return the stored ride
> (`GET /quick-rides/:id`, `bid:accepted`) give you **GeoJSON**:
> `{ "type": "Point", "coordinates": [longitude, latitude] }` — longitude first.
> Write one `toLatLng()` helper that handles both and use it everywhere.

### Polling fallback — when the socket is down

**`GET /api/v3/quick-rides/available?latitude=<lat>&longitude=<lng>`**

Use it on app resume or after a reconnect. It is a fallback, not the main path.

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | `{ busy: false, count, data: [...] }` | Ride list; each item has `distanceFromDriverKm` and `bidBounds` |
| `200` | `{ busy: true, count: 0, data: [] }` | **You are on a ride.** Show the active-ride screen, not an empty list |
| `400` | `{ message: 'Your current location is required', errors: [...] }` | Missing/invalid lat-lng query params |
| `409` | `{ message: 'Register a vehicle before accepting rides' }` | Send to the add-vehicle screen |

---

## 3. When the rider raises the fare

The rider can raise their offer while the ride is searching. You get:

**`ride:fare_updated`** — arrives **twice over, from two different places**, and
the payloads differ:

| You are | Payload |
| --- | --- |
| Nearby and free (re-dispatch) | The **full `ride:request` payload** above, with the new `offeredFare`/`bidBounds` |
| Already holding a bid on that ride | `{ rideId, offeredFare, bidBounds }` — the short form |

Handle both with one merge-into-card function keyed on `rideId`/`quickRideId`;
never assume the full shape.

What to do in the UI: update the fare on the card, **re-render the bid slider
with the new `bidBounds`**, and flash the card. A raise means the ceiling moved
up — a driver who skipped this ride at ₹500 may want it at ₹650.

Your existing bid is **not** changed by a fare raise. It stays exactly where it
was; you may lower it (see below), never raise it.

---

## 4. Bidding

**`POST /api/v3/quick-ride-bids`**

```json
{ "quickRideId": "66f1...", "fare": 480 }
```

### Success — `201`

```json
{
  "message": "Bid placed successfully.",
  "bid": {
    "_id": "66f2...",
    "quickRideId": "66f1...",
    "fare": 480,
    "requestStatus": "pending",
    "expiresAt": "2026-07-29T10:31:00.000Z",
    "requestedBy": { "_id": "...", "name": "...", "phoneNumber": "..." },
    "vehicleId": { "vehicleNumber": "DL01AB1234", "vehicleName": "Swift", "vehicleTypeId": { ... } }
  }
}
```

Start a countdown from `expiresAt` — **60s** by default (`BID_TTL_SECONDS`).
When it fires you also get a `bid:expired` socket event; treat whichever
arrives first as the truth and grey out the card.

### Error cases

| Status | Body | What the app should do |
| --- | --- | --- |
| `400` | `{ message: 'All fields are required', errors: [...] }` | Missing `quickRideId` or a non-positive `fare` |
| `400` | `{ message: 'Your bid must be between 400 and 750', bidBounds: {...} }` | Clamp the slider to the returned bounds and re-render |
| `400` | `{ message: 'You can only lower your existing bid of 480', currentBid: 480 }` | Cap the slider at `currentBid - 1` |
| `404` | `{ message: 'Ride not found' }` | Remove the card |
| `409` | `{ message: 'This ride is no longer accepting bids' }` | Ride was taken/cancelled/expired — remove the card |
| `409` | `{ message: 'You already have an active ride. Finish it before bidding again.' }` | Navigate to the active ride instead |
| `409` | `{ message: 'This ride is for a different vehicle type' }` | Stale card — remove it |
| `409` | `{ message: 'Register a vehicle before bidding' }` | Send to the add-vehicle screen |

### About "one pending bid at a time" — read this carefully

**The server does not enforce that rule.** What it actually enforces is:

- **One live bid per ride.** Re-bidding on the *same* ride replaces the old bid,
  and the new fare **must be lower** — you can undercut yourself to win, never
  walk the price up.
- **No bidding at all while you hold an active ride** (`assigned`/`in_progress`) — that
  is the `409` above.

A free driver **may** hold pending bids on several different rides at once. That
is deliberate: bids expire in 60s, and the moment one is accepted the server
deletes that driver's bids on every other ride and tells those riders
(`bid:removed`). So the driver is never double-booked.

If you want the app to show one bid at a time anyway, do it in the UI:

```js
const { data: myBids } = await api.get('/quick-ride-bids/my');
if (myBids.length) disableBidButtons();   // presentation only
```

**`GET /api/v3/quick-ride-bids/my`** → `200 { count, data: [ { ...bid, quickRideId: {full ride} } ] }`
returns only live bids and is the right thing to call on app resume to rebuild
the "bid pending" state.

Be clear with whoever asked for this: a client-side rule is a UX choice, not a
guarantee. If the one-bid-at-a-time rule is a *business* requirement it has to
move into `createBid` on the server — say the word and it is a small change.

### Withdrawing

**`DELETE /api/v3/quick-ride-bids/:id/withdraw`**

| Status | Body |
| --- | --- |
| `200` | `{ message: 'Bid withdrawn successfully.' }` |
| `403` | `{ error: 'Forbidden: this bid belongs to another driver' }` |
| `404` | `{ message: 'Bid not found' }` — already expired and swept |
| `409` | `{ message: 'An accepted bid cannot be withdrawn. Cancel the ride instead.' }` |

### Losing

`ride:taken` → `{ rideId, bidId }`. Another driver won. Remove the card quietly;
do not show it as an error.

---

## 5. Winning — `bid:accepted` and the handoff to the details screen

```js
socket.on('bid:accepted', ({ rideId, ride, finalFare }) => {
  navigation.navigate('RideDetails', { rideId });   // navigate on rideId
});
```

```json
{
  "rideId": "66f1...",
  "finalFare": 480,
  "ride": { "...the full populated ride...": "" }
}
```

The embedded `ride` is complete enough to render the screen immediately — use it
as the first paint so the screen is never blank. Then call
`GET /quick-rides/:id` to become the source of truth. Do not rely on the socket
payload alone: the driver may have been backgrounded, may have missed the event,
or may cold-start into this screen.

**There is no `startOtp` in the driver's payload, and there never will be.** The
rider's app shows the OTP; the rider reads it out. Same for the tracking link.

Also fired at the same moment: the server puts you into the ride room
automatically. You do **not** need to emit `ride:join` — just keep pinging
`driver:location` and the rider's map starts moving.

---

## 6. The ride details screen

### Fetching

**`GET /api/v3/quick-rides/:id`**

```json
{
  "ride": {
    "_id": "66f1...",
    "rideStatus": "assigned",
    "pickupLocationName": "Connaught Place",
    "dropLocationName": "Sector 62 Noida",
    "pickupCoordinates": { "type": "Point", "coordinates": [77.2167, 28.6315] },
    "dropCoordinates":   { "type": "Point", "coordinates": [77.391, 28.5355] },
    "estimatedDistanceKm": 24.31,
    "estimatedDurationMin": 58,
    "finalFare": 480,
    "startOtpAttempts": 0,
    "bookedBy":  { "_id": "...", "name": "Rider", "phoneNumber": "98...", "profileImageUrl": "..." },
    "assignedTo":{ "_id": "...", "name": "Driver", "phoneNumber": "99...", "profileImageUrl": "..." },
    "vehicleTypeId": { "name": "Mini", "icon": "...", "capacity": 4 },
    "startedAt": null,
    "completedAt": null
  }
}
```

| Status | Body |
| --- | --- |
| `200` | as above (the driver's copy never contains `startOtp` or `trackingUrl`) |
| `403` | `{ error: 'Forbidden: you are not part of this ride' }` |
| `404` | `{ message: 'Ride not found' }` |

Show: rider name + photo, **call button** on `bookedBy.phoneNumber`, `finalFare`
(this is what you get paid — not `offeredFare`), trip distance/duration, and the
phase-appropriate destination below.

### Phase-wise navigation — the important part

The screen renders **one destination at a time**, driven entirely by
`rideStatus`:

| `rideStatus` | Destination | Primary button | Show the drop address? |
| --- | --- | --- | --- |
| `assigned` | **Pickup** | "Navigate to pickup" → then "Enter OTP" | No — pickup only |
| `in_progress` | **Drop** | "Navigate to drop" → then "Complete ride" | Yes — drop only |
| `completed` | — | "Done" → success screen | Trip summary |

```js
const toLatLng = (c) =>
  c?.coordinates ? { lat: c.coordinates[1], lng: c.coordinates[0] }   // GeoJSON: [lng, lat]
                 : { lat: c.latitude,       lng: c.longitude };       // socket payload

const target = ride.rideStatus === 'assigned'
  ? toLatLng(ride.pickupCoordinates)
  : toLatLng(ride.dropCoordinates);
```

Handing the coordinates to the phone's navigation app:

```js
// Android — Google Maps turn-by-turn
`google.navigation:q=${target.lat},${target.lng}&mode=d`
// iOS — Apple Maps
`maps://?daddr=${target.lat},${target.lng}&dirflg=d`
// Universal web fallback (works on both, opens the installed Maps app)
`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`
```

Always navigate to **coordinates**, never to `pickupLocationName` — the name is a
display label the rider typed/picked and may be ambiguous.

Re-render the screen on `rideStatus` change. The status changes come back in the
response of `start`/`complete`, and also arrive as `ride:started` /
`ride:completed` socket events — drive the UI off whichever lands first and make
the transition idempotent.

---

## 7. Start the ride with the OTP

The rider reads out a 4-digit OTP. You type it in.

**`PATCH /api/v3/quick-rides/:id/start`** · `{ "startOtp": "4821" }`

### Success — `200`

```json
{ "message": "Ride started successfully.", "ride": { "rideStatus": "in_progress", "startedAt": "..." } }
```

Switch the screen to the drop-navigation phase.

### Error cases — all of them matter here

| Status | Body | What to show |
| --- | --- | --- |
| `400` | `{ message: 'Start OTP is required', errors: [...] }` | Empty input |
| `400` | `{ message: 'Incorrect OTP', attemptsRemaining: 3 }` | **Show the count**: "Incorrect — 3 attempts left" |
| `403` | `{ error: 'Forbidden: this ride is assigned to another driver' }` | Stale screen — go back |
| `404` | `{ message: 'Ride not found' }` | Go back |
| `409` | `{ message: 'Ride cannot be started while it is in_progress' }` | Already started — just move to the drop phase |
| `423` | `{ message: 'Too many incorrect OTP attempts. This ride is locked — please cancel and rebook.' }` | **Dead end.** Disable the OTP field, offer "Cancel ride" only |

`423` is permanent for that ride — 5 wrong attempts (`RIDE_START_OTP_MAX_ATTEMPTS`)
and the only way out is cancelling. Make that obvious rather than letting the
driver keep typing.

---

## 8. Complete the ride

**`PATCH /api/v3/quick-rides/:id/complete`** · no body

### Success — `200`

```json
{
  "message": "Ride completed successfully.",
  "ride": { "rideStatus": "completed", "completedAt": "...", "finalFare": 480 },
  "paymentDetails": { "upi": "ramesh@okaxis" }
}
```

Navigate to the **success screen** with `finalFare` and `completedAt`. This call
is also what **frees the driver** — new `ride:request` events start arriving
again immediately (as long as you are still pinging `driver:location`).

### Collecting the fare — the UPI QR

`paymentDetails` is the driver's own payee record, sent along so the success
screen can show a **UPI QR** without a second round trip. It is absent for a
driver who never saved a UPI id, and the field is spelled `upi` here against
`upiId` on `/payment-details` — read it through `upiIdOf` (`src/utils/upi.ts`),
which accepts either and rejects anything that fails the format check.

The QR encodes an NPCI deep link, built by `upiPaymentUrl`:

```
upi://pay?pa=ramesh@okaxis&cu=INR&pn=Ramesh%20Kumar&am=480.00&tr=<rideId>&tn=<drop>
```

- `am` is **`finalFare`**, two decimals, no separators or symbol. Anything else
  (`₹1,250`) makes UPI apps drop the amount and prompt the rider for it.
- `tr` is the ride id, so a payment can be matched back to the trip.
- `pa` is left unescaped — it already passed `UPI_PATTERN`, and some apps
  mis-handle a `%40`.

The `ride:completed` socket event carries no `paymentDetails`, so a success
screen reached that way falls back to `GET /payment-details/my`.

| Status | Body | What to do |
| --- | --- | --- |
| `200` | above | Success screen |
| `403` | `{ error: 'Forbidden: this ride is assigned to another driver' }` | Go home |
| `404` | `{ message: 'Ride not found' }` | Go home |
| `409` | `{ message: 'Only a ride in progress can be completed (it is assigned)' }` | The OTP step was never done — go back to the OTP phase |

At the same moment the server tears down the ride room and emits `ride:ended` to
everyone in it. Stop rendering the trip map when you see it.

---

## 9. Cancelling

**`PATCH /api/v3/quick-rides/:id/cancel`** · `{ "cancellationReason": "Rider not at pickup" }`

Allowed from `searching` and `assigned` only. `cancelledBy` is taken from your
token — do not send it.

| Status | Body |
| --- | --- |
| `200` | `{ message: 'Ride cancelled successfully.', ride: {...} }` |
| `403` | `{ error: 'Forbidden: you are not part of this ride' }` |
| `404` | `{ message: 'Ride not found' }` |
| `409` | `{ message: 'A ride that is in_progress cannot be cancelled' }` — mid-trip is a support case |

---

## 10. Reconnects and cold starts

The socket does the right thing on reconnect **by itself**: the server re-joins
you to your active ride room and emits

```js
socket.on('ride:rejoined', ({ rideId, rideStatus }) => {
  // deep-link straight to the details screen at the right phase
});
```

On a cold start (app killed mid-ride) do this, in order:

1. **`GET /quick-rides/live?latitude&longitude`** (§0) — one call, whole picture
2. If `hasLiveRide`, open the details screen at the `navigateTo` phase before
   showing the home screen. Otherwise render the home screen from
   `availableRides` and restore pending-bid state from `bids`
3. Connect the socket. If `driver:resumed` arrives, just resume location pings;
   if it does not, emit `driver:online` first

`GET /api/v3/quick-rides/my` → `200 { count, data: [ ...rides, newest first ] }`
is the **history** screen. Use `/live` for resuming, not `/my` — `/my` returns
every ride the driver has ever taken and makes you find the active one yourself.

---

## Event reference

### Emit (driver → server)

| Event | Payload | Ack |
| --- | --- | --- |
| `driver:online` | `{ latitude, longitude }` | `{ ok, message? }` |
| `driver:location` | `{ latitude, longitude, heading?, speed? }` | none — fire and forget |
| `driver:offline` | `{}` | `{ ok }` |
| `ride:join` | `{ rideId }` | `{ ok, message? }` — rarely needed; the server auto-joins you |

### Listen (server → driver)

| Event | Payload | Meaning |
| --- | --- | --- |
| `ride:request` | full ride card | New ride nearby |
| `ride:fare_updated` | full card **or** `{ rideId, offeredFare, bidBounds }` | Rider raised the offer |
| `bid:accepted` | `{ rideId, ride, finalFare }` | **You won** — go to details |
| `ride:taken` | `{ rideId, bidId }` | Another driver won — drop the card |
| `bid:expired` | `{ bidId, quickRideId }` | Your 60s ran out |
| `bid:removed` | `{ bidId, quickRideId }` | The rider dismissed your bid |
| `ride:cancelled` | `{ rideId, cancelledBy, cancellationReason }` | Rider cancelled |
| `ride:started` | `{ rideId, startedAt }` | OTP accepted (mirrors your own call) |
| `ride:completed` | `{ rideId, completedAt, finalFare }` | Trip closed |
| `ride:expired` | `{ rideId }` | Ride timed out with no accept |
| `ride:ended` | `{ rideId, reason }` | Room torn down — stop the trip UI |
| `ride:rejoined` | `{ rideId, rideStatus }` | Reconnected into an active ride |
| `driver:resumed` | `{ latitude, longitude, offlineForMs }` | Reconnected inside the grace window — **skip `driver:online`**, resume pings |

---

## Endpoint reference

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/quick-rides/live?latitude&longitude` | **either** | **Resume on open** — active ride, phase, bids, nearby rides |
| `GET` | `/quick-rides/available?latitude&longitude` | driver | Polling fallback for ride cards |
| `GET` | `/quick-rides/my` | driver | Ride history |
| `GET` | `/quick-rides/:id` | participant | Details screen |
| `PATCH` | `/quick-rides/:id/start` | driver | Start with the rider's OTP |
| `PATCH` | `/quick-rides/:id/complete` | driver | Finish, free the driver |
| `PATCH` | `/quick-rides/:id/cancel` | participant | Cancel before the trip starts |
| `POST` | `/quick-ride-bids` | driver | Place / lower a bid |
| `GET` | `/quick-ride-bids/my` | driver | Rebuild pending-bid state |
| `DELETE` | `/quick-ride-bids/:id/withdraw` | driver | Take a bid back |

Shared error shapes: `401 { error: 'Not authorized, ...' }` (token missing,
expired, or the account is gone → log out) and
`403 { error: 'Forbidden: insufficient permissions' }` (a rider token hit a
driver route).
