# Outstation Rides — Driver App Frontend Guide

Long-distance, optionally scheduled trips. A separate collection and a longer
lifecycle from QuickRide, sharing the same auth, sockets and fare machinery.

Related: [QuickRide](./driver-quick-ride.md) ·
[Driver Login & Onboarding](./driver-auth-onboarding.md) ·
[Driver KYC](./driver-kyc.md) · [Profile, Vehicle & Payments](./driver-profile-and-payments.md)

- **Base URL:** `http://localhost:5000/api/v3` (dev)
- **Socket URL:** `http://localhost:5000`
- Every REST call below needs a **driver** token: `Authorization: Bearer <token>`

> **Try it first: [`/test/outstation`](http://localhost:5000/test/outstation)** — a rider-side
> browser console for booking scheduled trips and watching the tracking window from the rider's
> end. See [Test console](#test-console) below.

---

## The shape of the whole thing

```
[App opens / returns from background]
   │  GET /outstation-rides/live      ← one call: "where was I?"
   ▼
[Home screen]
   │  socket.connect({ auth: { token } })
   │  emit driver:online  { latitude, longitude }
   │  emit driver:location every 5s
   ▼
[Trip cards]  ◄── on 'outstation:request'        (a new trip within 20 km)
   │          ◄── on 'outstation:fare_updated'   (rider raised the price)
   │          ◄── on 'outstation:ride_cancelled' / 'outstation:ride_taken'
   │
   │  ALSO: GET /outstation-rides/available — a first-class browse list, not just
   │  a polling fallback. A trip booked for next Friday will never be pushed to a
   │  driver who is offline today.
   │
   │  POST /outstation-ride-bids   { outstationRideId, fare }
   ▼
[Bid placed — NO countdown. Outstation bids never expire.]
   │          ◄── on 'outstation:ride_taken'    (another driver won)
   │          ◄── on 'outstation:bid_accepted'  (YOU won) ──────┐
   ▼                                                            │
[Trip details screen] ◄──────────────────────────────────────────┘
   │  rideStatus 'assigned' — you are committed, possibly days ahead.
   │  NO live tracking yet. The rider cannot see you and there is no share link.
   │
   │  PATCH /outstation-rides/:id/start        ← no OTP: "I'm setting off"
   ▼
[On the way to pickup]  rideStatus 'arriving'
   │  Tracking is now LIVE. Your driver:location pings feed the rider's map and
   │  the share link they may have sent to family.
   │  navigate to PICKUP
   │
   │  PATCH /outstation-rides/:id/pickup  { startOtp }   ← rider reads it out
   ▼
[Trip in progress]  rideStatus 'in_progress'
   │  Tracking is now OFF. The room is torn down and the share link is dead.
   │  Your location pings no longer reach the rider.
   │  navigate to DROP
   │
   │  PATCH /outstation-rides/:id/complete
   ▼
[Success screen]  finalFare, completedAt, paymentDetails
```

### Four rules that explain most of the API

1. **Identity always comes from the token.** Never send a `driverId` anywhere.
2. **Two driver actions, not one.** `/start` (no OTP) says you are setting off;
   `/pickup` (OTP) says the rider is aboard. QuickRide collapses these into one.
3. **Tracking starts at `/start`, not at assignment.** `assigned` → nothing.
   `arriving` and `in_progress` → live position and a share link, one unbroken
   window. Waiting for `/start` is deliberate: a trip accepted three days early
   must not broadcast your position for three days.
4. **Bids never expire.** Yours stays on the rider's screen until something
   explicitly removes it — the ride is taken/cancelled/expires, you withdraw, or
   the rider dismisses it.

---

## When you can and cannot take work

Availability is derived from the two ride collections, never stored, and the two
products block each other **asymmetrically**.

| You currently have | Can take a QuickRide? | Can take an outstation trip? |
|---|---|---|
| Nothing | yes | yes |
| An active QuickRide (`assigned`/`in_progress`) | no | **no** |
| An outstation trip, pickup > 2h away | **yes** | no |
| An outstation trip, pickup ≤ 2h away, or under way | **no** | no |
| Pending outstation **bids** only (any number) | yes | yes |

The 2-hour line is `OUTSTATION_QUICKRIDE_BLOCK_MINUTES`. It exists so a driver
with a Friday trip keeps earning all week and stops only when they have to set off.

Both `GET /available` and `GET /live` return `busyReason` so the app can say
*why*: `active_quick_ride`, `active_outstation_ride`, or
`outstation_pickup_imminent`.

**One accepted trip at a time.** You may hold pending bids on as many trips as
you like; the moment one is accepted, all your other outstation bids are deleted
and those riders are notified.

---

## Socket events

Outstation events are **namespaced**. An older app build with no
`outstation:*` listeners simply ignores these rides, which is the intended
degradation — it must never render one as a QuickRide card and bid it to
`/quick-ride-bids`.

| Trigger | QuickRide | Outstation |
|---|---|---|
| New trip pushed to you | `ride:request` | `outstation:request` |
| Rider raised the fare | `ride:fare_updated` | `outstation:fare_updated` |
| No drivers found (rider) | `ride:no_drivers` | `outstation:no_drivers` |
| New bid (→ rider) | `bid:new` | `outstation:bid_new` |
| Bid gone | `bid:removed` | `outstation:bid_removed` |
| Bid expired | `bid:expired` | *(never — outstation bids don't expire)* |
| Your bid won | `bid:accepted` | `outstation:bid_accepted` |
| Assigned (→ rider, carries OTP) | `ride:assigned` | `outstation:assigned` |
| Someone else won | `ride:taken` | `outstation:ride_taken` |
| Cancelled | `ride:cancelled` | `outstation:ride_cancelled` |
| Expired | `ride:expired` | `outstation:ride_expired` |
| Driver set off (→ rider, carries `trackingUrl`) | — | `outstation:started` |
| Rider picked up | `ride:started` | `outstation:picked_up` |
| Completed | `ride:completed` | `outstation:completed` |
| **Live position** (room-scoped) | `ride:location` | **shared — `ride:location`** |
| **Room torn down** (room-scoped) | `ride:ended` | **shared — `ride:ended`** |
| Rejoined after reconnect | `ride:rejoined` | **shared, now carries `rideType`** |

`outstation:request` payload adds `rideType: 'outstation'`, `bookingType` and
`pickupAt` to the QuickRide card shape.

### `ride:ended` reasons

`completed` · `cancelled` · `expired` — the same three for both products.

There is no `picked_up` teardown. The outstation room stays up through pickup
and the whole journey, so `outstation:picked_up` (which is also broadcast into
the room) is a **label change** for a tracking page — *"the rider is on board"* —
not an end-of-stream.

### `ride:join` now takes a ride type

```js
socket.emit('ride:join', { rideId, rideType: 'outstation' });
```

`rideType` is optional and defaults to `'quickride'`, so shipped apps keep
working. An outstation room is joinable **while `arriving` or `in_progress`** — joining an
`assigned` or `in_progress` one returns `ride:join_error`.

### Reconnect

You may be in two rooms at once (an outstation trip you are driving to and a
QuickRide accepted before the block window closed). On reconnect you get **one
`ride:rejoined` per ride**, each with its own `rideType`, and a single
`driver:location` ping is fanned out to both rooms.

---

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/outstation-rides/fare-estimate` | *(rider)* rejects trips under 100 km; returns `minPickupAt` / `maxPickupAt` for the date picker |
| `POST` | `/outstation-rides` | *(rider)* see booking below |
| `GET` | `/outstation-rides/available` | `?latitude&longitude&bookingType=now\|later` — 20 km, soonest departure first |
| `GET` | `/outstation-rides/live` | either role; **the rider branch returns an array** |
| `GET` | `/outstation-rides/my` | `?status=&date=\|from=&to=&by=createdAt\|pickupAt` |
| `GET` | `/outstation-rides/track/:token` | public; resolves while `arriving` or `in_progress` |
| `GET` | `/outstation-rides/:id` | participants only |
| `GET` | `/outstation-rides/:id/bids` | *(rider)* |
| `PATCH` | `/outstation-rides/:id/fare` | *(rider)* increase-only |
| `PATCH` | `/outstation-rides/:id/start` | **no body.** `assigned → arriving` |
| `PATCH` | `/outstation-rides/:id/pickup` | `{ startOtp }`. `arriving → in_progress` |
| `PATCH` | `/outstation-rides/:id/complete` | |
| `PATCH` | `/outstation-rides/:id/cancel` | either party; allowed from `searching`/`assigned`/`arriving` |
| `POST` | `/outstation-ride-bids` | `{ outstationRideId, fare }` |
| `GET` | `/outstation-ride-bids/my` | no expiry filter — bids persist |
| `PATCH` | `/outstation-ride-bids/:id/accept` | *(rider)* |
| `DELETE` | `/outstation-ride-bids/:id/withdraw` | *(driver)* |
| `DELETE` | `/outstation-ride-bids/:id` | *(rider)* dismiss |

### Booking (rider side, for context)

`POST /outstation-rides` takes the QuickRide fields plus a pickup time in
**one of two forms** — sending both is a `400`:

```jsonc
{ "bookingType": "now" }                                  // pickupAt = server time
{ "bookingType": "later", "pickupDate": "2026-08-05", "pickupTime": "09:30" }
{ "bookingType": "later", "pickupAt": "2026-08-05T04:00:00.000Z" }
```

The date/time pair is interpreted in the app's zone (`APP_UTC_OFFSET_MINUTES`,
IST by default), so `09:30` above is `04:00Z`. Scheduled pickups must be at
least `OUTSTATION_MIN_LEAD_MINUTES` (60) ahead and at most
`OUTSTATION_MAX_ADVANCE_DAYS` (30) out.

**Riders may have several outstation trips searching at once** — unlike
QuickRide, there is no one-open-ride `409`.

### Expiry

`expiresAt = createdAt + 24h`, capped at `pickupAt` for `later` bookings only.
A `now` booking is never capped (that would make it expire the instant it was
created). When it lapses, everyone holding a card gets `outstation:ride_expired`.

---

## Error cases worth a screen

| Call | Code | Meaning |
|---|---|---|
| `POST /fare-estimate` | `400` | trip is under 100 km — offer QuickRide instead |
| `POST /outstation-ride-bids` | `409` + `reason` | you are blocked; show `message` verbatim |
| `POST /outstation-ride-bids` | `409` | ride no longer accepting bids / wrong vehicle type / no vehicle registered |
| `POST /outstation-ride-bids` | `400` | bid outside the band, or a re-bid that isn't lower |
| `PATCH /:id/start` | `409` | not `assigned` (already started, or cancelled) |
| `PATCH /:id/pickup` | `409` | not `arriving` — *"start the ride before confirming the pickup"* |
| `PATCH /:id/pickup` | `400` | wrong OTP; `attemptsRemaining` tells you how many are left |
| `PATCH /:id/pickup` | `423` | locked after 5 wrong attempts — cancel and rebook |
| `PATCH /:id/accept` *(rider)* | `409` + `reason` | the bidding driver is no longer available; their bid was removed |

---

## Test console

`public/outstation-test.html`, served at **`/test/outstation`** in non-production
(`NODE_ENV !== 'production'`). Self-contained, no build step; `socket.io-client`
comes from the server itself.

**Rider-side only**, like the QuickRide console. It holds two sockets — the rider,
and a share-link viewer authenticating with nothing but a `trackingToken`.
Everything from bidding onward needs a separate driver client (the driver app, or
curl with a driver token); this console is the other half of that conversation.

### The run

1. **Sign in.** Phone + OTP, or paste a rider JWT.
2. **Set the trip.** 📍 **Use my current location** fills pickup *or* drop —
   pick which with the dropdown beside it. A straight-line distance hint updates
   as you type and warns when you are under the 100 km floor (the server prices
   the longer *road* distance, so the hint is a floor, not the verdict). The
   Delhi → Jaipur preset is ~270 km; the Noida preset (~30 km) is there to watch
   the gate return a `400`.
3. **Pick a time.** `now`, or `later` with a date/time. The **"send it as"**
   selector chooses which wire form goes out — `pickupDate + pickupTime`,
   `pickupAt` as ISO, or **both at once to confirm the `400`**.
4. **Book**, then drive the driver side elsewhere and watch this page react.
5. **Bids land in section 6.** Trips are a list, so that panel is bound to whichever
   trip is **selected** — click a card in section 5 to switch. The trip you just
   booked is selected automatically, as is the first trip a bid arrives on.

Geolocation needs a secure context: `http://localhost` qualifies, a plain-http
LAN IP does not, and the page says so rather than failing silently.

### What it is built to make visible

| Behaviour | How you see it |
|---|---|
| Events are namespaced | The log shows `outstation:*`. Any `ride:request` / `bid:new` / `ride:assigned` arriving here is logged **in red as a warning** — those belong to QuickRide, and seeing one means the two feeds have crossed |
| Bids never expire | Bid cards read *"placed N min ago · no expiry"* instead of a countdown. Leave one for five minutes; it is still there |
| Bids arrive reliably | `outstation:bid_new` is applied to local state immediately, and a 5 s poll of `/live` runs while any trip is open. Sockets are still the delivery path — the poll exists because a dropped event looks exactly like *"no driver has bid yet"*, and the two must not be confusable while testing. The `polling:` pill shows when it is on |
| Rider may hold many trips | Section 5 is a **list** with a count pill; each card shows its own bid count, and the bids panel follows the selected trip |
| Scheduling | Each card shows `pickupAt`, `bookingType` and `expiresAt` — so you can see the 24 h TTL on a far booking and the `pickupAt` cap on a near one |
| **The tracking window** | Three boxes light in sequence. The `ride:location` counter is the assertion: it must stay at **0** while the trip is `assigned`, start climbing on `outstation:started`, and **keep climbing through `outstation:picked_up`** until the trip completes |
| The share link's lifetime | The link field is empty until `arriving`. **Connect as share-link viewer** opens a socket with *only* the `trackingToken`, proving the handshake resolves outstation tokens; **`GET /track/:token`** returns `200` from `arriving` through `in_progress`, and `404` once the trip is completed, cancelled or expired |

### The one check worth doing every time

Have the driver ping their location **while the trip is still `assigned`**. This
page's `ride:location` counter must stay at **0** — no room exists yet. That is
the guarantee a trip booked for next Friday does not broadcast the driver's
position all week.

---

## The shareable tracking page

The rider forwards `${TRACKING_LINK_BASE_URL}/${trackingToken}` to whoever they
like. A reference implementation ships at **`public/track.html`**, served by this
backend at **`/track/:token`** — set `TRACKING_LINK_BASE_URL=http://localhost:5000/track`
to get working links locally.

It serves **both products**: a share link is an opaque token, so the page tries
`/quick-rides/track/:token` first, then `/outstation-rides/track/:token`, and
remembers which answered. That is the same order the socket handshake uses.

### The contract any tracking front-end must implement

```js
// 1. Snapshot — public, no auth. Also the only way to learn the rideId.
GET /api/v3/{quick-rides|outstation-rides}/track/:token

// 2. Connect with the token as the sole credential
io(origin, { auth: { trackingToken } })       // → role 'viewer', read-only

// 3. Join the room — NOT optional
socket.emit('ride:join', { rideId, rideType })
```

**Step 3 is the one that bites.** A viewer socket is authenticated but joins no
room on connect, so skipping it leaves a live connection that never receives a
single `ride:location` — indistinguishable from "the driver isn't moving".

### What it must handle

| Event / response | Meaning |
|---|---|
| `404` on the snapshot | Unknown token, or a trip that has finished, been cancelled or expired. Deliberately indistinguishable — a shared link must not reveal which |
| `ride:location` | Move the marker |
| `outstation:picked_up` | **Outstation only, and not a teardown.** The rider is in the vehicle and the journey has begun. Relabel to "the rider is on board" and keep the map running |
| `ride:ended` `completed` / `cancelled` / `expired` | Terminal; the socket is evicted from the room |

### Map choice

Leaflet + OpenStreetMap, no API key. **Do not use the `GOOGLE_MAPS_API_KEY` from
`env`** — it is a server-side Distance Matrix key, and this page is handed to
anyone the rider forwards the link to. Putting it in the markup publishes it,
billing and all. If Google Maps is wanted here, it needs a separate browser key
with an HTTP-referrer restriction.

---

## Operations runbook

### A driver stuck on an abandoned trip

There is **no auto-cancel** for an `assigned` or `arriving` outstation trip that
is never started or completed. `pickupAt` recedes into the past, the block
predicate stays true, and that driver is locked out of **both** products
indefinitely. This is a known, accepted gap — it needs a support action:

```js
// mongosh
db.outstationrides.updateOne(
  { _id: ObjectId("<rideId>") },
  { $set: { rideStatus: "cancelled", cancelledBy: "user",
            cancellationReason: "Support: trip abandoned", trackingToken: null } }
);
```

Confirm the driver is free again with
`GET /quick-rides/available` → `busy: false`.

To find candidates:

```js
db.outstationrides.find({
  rideStatus: { $in: ["assigned", "arriving"] },
  pickupAt: { $lte: new Date(Date.now() - 6 * 3600 * 1000) }
});
```
