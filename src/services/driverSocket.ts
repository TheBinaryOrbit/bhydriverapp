import { io, type Socket } from 'socket.io-client';

import { SOCKET_URL } from './api';
import type {
  BidBounds,
  QuickRide,
  RawRideCard,
  RideStatus,
} from '../types/quickRide';

/**
 * The realtime half of QuickRide — see `docs/driver-quick-ride.md` §1–2.
 *
 * A driver is discoverable only while all of these hold: the socket is up with
 * a valid driver JWT, `driver:online` was acknowledged, and a `driver:location`
 * ping landed in the last 30s. This module owns all three, so the UI only has
 * to say "go online" and hand it a position.
 */

/** The server drops entries after 30s without a ping; 5s leaves room to spare. */
export const LOCATION_PING_MS = 5000;

export type DriverPosition = {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
};

/**
 * How the socket itself is doing — **not** whether the driver is on duty.
 *
 * `reconnecting` matters: a dropped socket parks the driver's place in the geo
 * index for `DRIVER_DISCONNECT_GRACE_SECONDS` (5 min) rather than deleting it,
 * so the honest UI is "reconnecting…", never "you are offline".
 */
export type LinkStatus =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Server → driver events, with the payload each one carries. */
export type DriverSocketEvents = {
  /** A card, or occasionally the raw document — `toRideCard` takes either. */
  'ride:request': RawRideCard;
  /** Full card when re-dispatched to you, short form when you hold a bid. */
  'ride:fare_updated':
    | RawRideCard
    | { rideId: string; offeredFare?: number; bidBounds?: BidBounds };
  'bid:accepted': { rideId: string; ride?: QuickRide; finalFare?: number };
  'ride:taken': { rideId: string; bidId?: string };
  'bid:expired': { bidId?: string; quickRideId: string };
  'bid:removed': { bidId?: string; quickRideId: string };
  'ride:cancelled': {
    rideId: string;
    cancelledBy?: string;
    cancellationReason?: string;
  };
  'ride:started': { rideId: string; startedAt?: string };
  'ride:completed': {
    rideId: string;
    completedAt?: string;
    finalFare?: number;
  };
  'ride:expired': { rideId: string };
  'ride:ended': { rideId: string; reason?: string };
  'ride:rejoined': { rideId: string; rideStatus: RideStatus };
  /** Reconnected inside the grace window — **skip `driver:online`**. */
  'driver:resumed': {
    latitude?: number;
    longitude?: number;
    offlineForMs?: number;
  };
};

export type DriverSocketEvent = keyof DriverSocketEvents;

const SERVER_EVENTS: DriverSocketEvent[] = [
  'ride:request',
  'ride:fare_updated',
  'bid:accepted',
  'ride:taken',
  'bid:expired',
  'bid:removed',
  'ride:cancelled',
  'ride:started',
  'ride:completed',
  'ride:expired',
  'ride:ended',
  'ride:rejoined',
  'driver:resumed',
];

type Listener<E extends DriverSocketEvent> = (
  payload: DriverSocketEvents[E],
) => void;

export type OnlineAck = { ok: boolean; message?: string };

/**
 * One socket for the whole app, kept outside React so a screen unmounting —
 * switching tabs, opening the ride details — never drops the driver out of
 * dispatch. Screens subscribe and unsubscribe; the connection outlives them.
 */
class DriverSocket {
  private socket: Socket | null = null;
  private token: string | null = null;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPosition: DriverPosition | null = null;

  /** True once `driver:online` was acked, so a reconnect knows to re-announce. */
  private wantsOnline = false;

  private listeners = new Map<string, Set<(payload: any) => void>>();
  private linkListeners = new Set<(status: LinkStatus) => void>();
  private link: LinkStatus = 'disconnected';

  /* -------------------------------------------------- connection */

  /**
   * Opens the connection, or reuses the existing one when the token is
   * unchanged. The JWT goes in the **handshake**, not a header.
   */
  connect(token: string): void {
    if (this.socket && this.token === token) {
      if (this.socket.disconnected) {
        this.socket.connect();
      }
      return;
    }
    this.disconnect();

    this.token = token;
    this.setLink('connecting');

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      // The server holds the driver's place for 5 minutes, so keep trying for
      // at least that long rather than giving up after the default backoff.
      reconnectionDelayMax: 10000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.setLink('connected');
      // A reconnect inside the grace window is answered with `driver:resumed`
      // and needs no `driver:online`. Outside it, nothing comes back — so the
      // handler below re-announces only if `driver:resumed` never arrives.
      if (this.wantsOnline) {
        this.awaitResumeOrReannounce();
      }
    });

    socket.on('disconnect', () => {
      this.stopPings();
      // Parked, not evicted — the UI must not call this "offline" yet.
      this.setLink(this.wantsOnline ? 'reconnecting' : 'disconnected');
    });

    socket.io.on('reconnect_attempt', () => {
      this.setLink(this.wantsOnline ? 'reconnecting' : 'connecting');
    });

    socket.on('connect_error', () => {
      // `err.message` is 'Unauthorized: …' for a dead token. The caller decides
      // whether that means logging out; here it is just "not connected".
      this.setLink(this.wantsOnline ? 'reconnecting' : 'disconnected');
    });

    socket.on('driver:resumed', () => {
      this.resumed = true;
      // The position the server held is the last one we sent before dropping
      // and has gone stale, so `startPings` immediately overwrites it with the
      // freshest fix the GPS watcher has handed us.
      this.startPings();
    });

    // One relay per server event, fanned out to the current subscribers.
    SERVER_EVENTS.forEach(event => {
      socket.on(event, (payload: any) => this.dispatch(event, payload));
    });
  }

  /** Set by the `driver:resumed` handler; read by `awaitResumeOrReannounce`. */
  private resumed = false;

  /**
   * After a reconnect, wait a beat for `driver:resumed`. If it lands, the
   * server already put the driver back in the index. If it doesn't, the grace
   * window closed and `driver:online` has to run again.
   */
  private awaitResumeOrReannounce(): void {
    this.resumed = false;
    setTimeout(() => {
      if (!this.resumed && this.wantsOnline && this.socket?.connected) {
        this.goOnline(this.lastPosition);
      }
    }, 1500);
  }

  disconnect(): void {
    this.stopPings();
    this.wantsOnline = false;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.token = null;
    this.setLink('disconnected');
  }

  get linkStatus(): LinkStatus {
    return this.link;
  }

  private setLink(status: LinkStatus): void {
    if (this.link === status) {
      return;
    }
    this.link = status;
    this.linkListeners.forEach(listener => listener(status));
  }

  /** Subscribe to link changes. Returns the unsubscribe. */
  onLinkChange(listener: (status: LinkStatus) => void): () => void {
    this.linkListeners.add(listener);
    return () => {
      this.linkListeners.delete(listener);
    };
  }

  /* -------------------------------------------------- duty */

  /**
   * Announces the driver to dispatch. The ack is where KYC and vehicle
   * requirements are reported — a `{ ok: false }` is a normal outcome with a
   * message worth showing, not an error.
   */
  async goOnline(position?: DriverPosition | null): Promise<OnlineAck> {
    const at = position ?? this.lastPosition;
    if (!at) {
      return { ok: false, message: 'no-location' };
    }
    // Tapping the switch a second after launch is normal, and the handshake is
    // usually still in flight — waiting beats reporting a connection failure.
    if (!(await this.waitForConnection(6000))) {
      return { ok: false, message: 'not-connected' };
    }
    this.lastPosition = at;

    return new Promise(resolve => {
      // A silent server would otherwise leave the toggle spinning forever.
      const timeout = setTimeout(
        () => resolve({ ok: false, message: 'timeout' }),
        10000,
      );

      this.socket!.emit(
        'driver:online',
        { latitude: at.latitude, longitude: at.longitude },
        (ack: OnlineAck | undefined) => {
          clearTimeout(timeout);
          if (ack?.ok) {
            this.wantsOnline = true;
            this.startPings();
          }
          resolve(ack ?? { ok: false });
        },
      );
    });
  }

  /** Resolves true once connected, or false if `timeoutMs` passes first. */
  private waitForConnection(timeoutMs: number): Promise<boolean> {
    if (this.socket?.connected) {
      return Promise.resolve(true);
    }
    const socket = this.socket;
    if (!socket) {
      return Promise.resolve(false);
    }

    return new Promise(resolve => {
      const settle = (connected: boolean) => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        resolve(connected);
      };
      const onConnect = () => settle(true);
      const timer = setTimeout(() => settle(false), timeoutMs);
      socket.on('connect', onConnect);
    });
  }

  /** Evicts the driver from the geo index **immediately** — no grace window. */
  goOffline(): void {
    this.wantsOnline = false;
    this.stopPings();
    this.socket?.emit('driver:offline', {});
  }

  get isOnDuty(): boolean {
    return this.wantsOnline;
  }

  /* -------------------------------------------------- location */

  /**
   * Feeds the pinger. Called by the GPS watcher; the ping loop reads whatever
   * landed last rather than asking for a fix on its own schedule.
   */
  setPosition(position: DriverPosition): void {
    this.lastPosition = position;
  }

  get position(): DriverPosition | null {
    return this.lastPosition;
  }

  /**
   * The 5s ping does two jobs — it keeps a free driver discoverable **and**
   * feeds the rider's live map mid-trip. There is no second event and no other
   * cadence, so this never stops while the driver is on duty.
   */
  private startPings(): void {
    if (this.pingTimer) {
      return;
    }
    this.emitLocation();
    this.pingTimer = setInterval(() => this.emitLocation(), LOCATION_PING_MS);
  }

  private stopPings(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Fire and forget — the server acks nothing, and silently drops fixes that
   * are invalid or imply travel faster than `MAX_LOCATION_JUMP_KMPH`. A frozen
   * map is bad GPS, not a missing error.
   */
  private emitLocation(): void {
    const at = this.lastPosition;
    if (!at || !this.socket?.connected) {
      return;
    }
    this.socket.emit('driver:location', {
      latitude: at.latitude,
      longitude: at.longitude,
      heading: at.heading,
      speed: at.speed,
    });
  }

  /* -------------------------------------------------- events */

  on<E extends DriverSocketEvent>(event: E, listener: Listener<E>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as (payload: any) => void);
    this.listeners.set(event, set);

    return () => {
      set.delete(listener as (payload: any) => void);
    };
  }

  private dispatch(event: string, payload: any): void {
    this.listeners.get(event)?.forEach(listener => listener(payload));
  }
}

export const driverSocket = new DriverSocket();
