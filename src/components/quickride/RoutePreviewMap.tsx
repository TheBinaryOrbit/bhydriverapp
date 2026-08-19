import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  MapView,
  type MapViewController,
} from '@googlemaps/react-native-navigation-sdk';

import { fetchRoutePath } from '../../services/routesService';
import { colors } from '../../theme/colors';
import type { LatLng } from '../../types/quickRide';

/**
 * The leg the driver is on: where they are now, where they are heading, and the
 * road between them.
 *
 * One leg at a time, matching the rest of the ride screen — the driver's own
 * position to the pickup while `assigned`, then their position to the drop once
 * the trip is running. Showing the whole pickup-to-drop trip instead would draw
 * a line the driver isn't on and leave their own position off the map.
 *
 * Interactive: the driver pinches and pans it to look ahead at the approach.
 * Note that inside a `ScrollView` this means a drag over the map pans the map
 * rather than scrolling the page, which is the trade the gestures buy.
 *
 * The only line this draws is the driving route, fetched from the Routes
 * service. It arrives a moment after the first paint, and until it does — or if
 * it never does, on a dead network or a misconfigured key — the map shows the
 * destination marker and no line at all.
 *
 * It used to fall back to a straight hop between the two points, and that was
 * worse than nothing: a driver cannot tell a road that happens to run straight
 * from a line drawn because the request failed, so a broken key looked like a
 * short trip. Drawing nothing is at least legible as nothing.
 *
 * Either way this is an orientation aid; the turn-by-turn is the Navigate
 * button.
 */

type Props = {
  /** Where the driver is now. The map still renders without it. */
  from: LatLng | null;
  /** The end of this leg — the pickup, or the drop. */
  to: LatLng | null;
  height?: number;
};

const DEFAULT_HEIGHT = 220;

export default function RoutePreviewMap({
  from,
  to,
  height = DEFAULT_HEIGHT,
}: Props) {
  const controller = useRef<MapViewController | null>(null);
  const ready = useRef(false);
  /** What is currently drawn, so a re-render doesn't redraw the same line. */
  const drawn = useRef<string | null>(null);
  /**
   * The camera is framed **once** per leg. After that the map belongs to the
   * driver: a position ping every 5s that yanked the camera back would undo
   * every pinch they made.
   */
  const framed = useRef<string | null>(null);

  /**
   * The road route for the leg on screen, once it arrives. Held in state
   * rather than a ref so the draw actually re-runs when it lands, and tagged
   * with the destination it was fetched for so it can't outlive its leg.
   */
  const [route, setRoute] = useState<{ legEnd: string; path: LatLng[] } | null>(
    null,
  );

  const legEnd = to ? key(to) : null;
  const hasFix = from !== null;

  /**
   * Asked for once per leg — on the destination changing, or on the driver's
   * first fix arriving.
   *
   * Deliberately not on every `from`: that moves with each 5s position ping,
   * and re-routing on it would be a Directions call every five seconds for a
   * line that barely changes. The route is drawn from where the driver was when
   * the leg began; it is a preview of the way, not a line to their bumper.
   */
  useEffect(() => {
    if (!from || !to || !legEnd) {
      return;
    }
    let cancelled = false;

    fetchRoutePath(from, to).then(path => {
      if (!cancelled && path) {
        setRoute({ legEnd, path });
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFix, legEnd]);

  /** The line to draw: the road, or nothing until it arrives. */
  const onRoute = route !== null && route.legEnd === legEnd;
  const path = onRoute ? route!.path : null;
  /**
   * Two draws per leg at most — the marker alone, then the road once it lands.
   * The driver's position is deliberately absent from this key: nothing on the
   * map is drawn from it any more, so a 5s ping has nothing to redraw and
   * nothing to re-frame.
   */
  const pathKey = onRoute ? `${legEnd}|route` : legEnd;
  const frameKey = pathKey;

  const draw = useCallback(async () => {
    const map = controller.current;
    if (!map || !ready.current || !to || drawn.current === pathKey) {
      return;
    }
    drawn.current = pathKey;

    try {
      await map.clearMapView();

      if (path) {
        await map.addPolyline({
          points: path,
          color: colors.tertiary,
          width: 5,
        });
      }
      await map.addMarker({ position: to });

      if (framed.current !== frameKey) {
        framed.current = frameKey;
        const box = bounds(path ?? [to]);
        await map.moveCamera({
          target: box.centre,
          zoom: box.span > 0 ? zoomForSpan(box.span) : 15,
        });
      }
    } catch {
      // A map that failed to draw is not worth an error state on a screen the
      // driver is using to run a ride. Let it be a plain map.
      drawn.current = null;
    }
  }, [frameKey, path, pathKey, to]);

  // The coordinates land after the first paint — `/quick-rides/:id` follows the
  // socket's partial ride, and the driver's own fix arrives on its own clock.
  useEffect(() => {
    draw();
  }, [draw]);

  if (!to) {
    return null;
  }

  return (
    <View
      className="overflow-hidden rounded-2xl border border-border bg-surface"
      style={{ height }}
    >
      <MapView
        style={styles.map}
        onMapViewControllerCreated={next => {
          controller.current = next;
          draw();
        }}
        onMapReady={() => {
          ready.current = true;
          draw();
        }}
        // The driver's own blue dot is half of what this map is for.
        myLocationEnabled
        myLocationButtonEnabled
        scrollGesturesEnabled
        zoomGesturesEnabled
        zoomControlsEnabled
        rotateGesturesEnabled
        compassEnabled
        tiltGesturesEnabled={false}
        mapToolbarEnabled={false}
        trafficEnabled={false}
      />
    </View>
  );
}

const styles = { map: { flex: 1 } } as const;

function key(at: LatLng): string {
  return `${at.lat},${at.lng}`;
}

/**
 * The middle of everything being drawn, and how much ground it covers.
 *
 * Taken over the whole line rather than its two ends: a road route can bow well
 * outside the box its endpoints make, and framing on the endpoints alone would
 * cut the bulge off the map.
 */
function bounds(path: LatLng[]): { centre: LatLng; span: number } {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  path.forEach(point => {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  });

  return {
    centre: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
    // The view is wider than it is tall, so latitude is the tighter constraint.
    span: Math.max((maxLat - minLat) * 2, maxLng - minLng),
  };
}

/**
 * A zoom that fits that span with room to spare.
 *
 * The controller has no fit-to-bounds, so this works back from the span: the
 * whole world is one tile wide at zoom 0 and halves at every level, and the
 * `- 1.4` is the padding that keeps the ends off the edges.
 */
function zoomForSpan(span: number): number {
  return Math.min(Math.max(Math.log2(360 / Math.max(span, 0.002)) - 1.4, 3), 16);
}
