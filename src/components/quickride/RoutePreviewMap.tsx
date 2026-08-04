import React, { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import {
  MapView,
  type MapViewController,
} from '@googlemaps/react-native-navigation-sdk';

import { colors } from '../../theme/colors';
import type { LatLng } from '../../types/quickRide';

/**
 * The leg the driver is on: where they are now, where they are heading, and the
 * line between them.
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
 * The line is a straight one. Drawing the actual road route would mean a
 * Directions call and a key in the JS bundle, and this is an orientation aid —
 * the turn-by-turn is the Navigate button.
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

  const leg = to ? `${from ? key(from) : 'none'}|${key(to)}` : null;
  const legEnd = to ? key(to) : null;

  const draw = useCallback(async () => {
    const map = controller.current;
    if (!map || !ready.current || !to || drawn.current === leg) {
      return;
    }
    drawn.current = leg;

    try {
      await map.clearMapView();

      if (from) {
        await map.addPolyline({
          points: [from, to],
          color: colors.tertiary,
          width: 5,
        });
      }
      await map.addMarker({ position: to });

      // Only on the first draw of this leg, and again when the leg changes.
      if (framed.current !== legEnd) {
        framed.current = legEnd;
        await map.moveCamera({
          target: from
            ? { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }
            : to,
          zoom: from ? zoomFor(from, to) : 15,
        });
      }
    } catch {
      // A map that failed to draw is not worth an error state on a screen the
      // driver is using to run a ride. Let it be a plain map.
      drawn.current = null;
    }
  }, [from, leg, legEnd, to]);

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
 * A zoom that fits both ends with room to spare.
 *
 * The controller has no fit-to-bounds, so this works back from the span: the
 * whole world is one tile wide at zoom 0 and halves at every level, and the
 * `- 1.4` is the padding that keeps both ends off the edges.
 */
function zoomFor(from: LatLng, to: LatLng): number {
  const latSpan = Math.abs(from.lat - to.lat);
  const lngSpan = Math.abs(from.lng - to.lng);
  // The view is wider than it is tall, so latitude is the tighter constraint.
  const span = Math.max(latSpan * 2, lngSpan, 0.002);
  return Math.min(Math.max(Math.log2(360 / span) - 1.4, 3), 16);
}
