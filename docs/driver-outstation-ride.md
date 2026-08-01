# Outstation Rides — Driver App Frontend Guide

Long-distance, optionally scheduled trips. A separate collection and a longer
lifecycle from QuickRide, sharing the same auth, sockets and fare machinery.

Related: [QuickRide](./driver-quick-ride.md) ·
[Driver Login & Onboarding](./driver-auth-onboarding.md) ·
[Driver KYC](./driver-kyc.md) · [Profile, Vehicle & Payments](./driver-profile-and-payments.md)

- **Base URL:** `http://localhost:5000/api/v3` (dev)
- **Socket URL:** `http://localhost:5000`
- Every REST call below needs a **driver** token: `Authorization: Bearer <token>`

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
3. **Tracking exists only between them.** `assigned` → nothing. `arriving` →
   live position and a share link. `in_progress` → nothing again. This is
   deliberate: a trip accepted three days early must not broadcast your position
   for three days.
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

`completed` · `cancelled` · `expired` · **`picked_up`** (new — outstation only).
A tracking page seeing `picked_up` should say *"the rider is on board"*, not
*"this ride has ended"*.

### `ride:join` now takes a ride type

```js
socket.emit('ride:join', { rideId, rideType: 'outstation' });
```

`rideType` is optional and defaults to `'quickride'`, so shipped apps keep
working. An outstation room is joinable **only while `arriving`** — joining an
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
| `GET` | `/outstation-rides/track/:token` | public; resolves only while `arriving` |
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
