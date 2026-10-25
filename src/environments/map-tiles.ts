/**
 * Which map tiles MapService loads (Phase 12, the student's choice: MapTiler).
 * - With a MapTiler key: "Streets" in high resolution (sharp street names on dense phone screens).
 * - Without a key (a fresh clone, or the key not set yet): OpenStreetMap, so the map still works.
 * The key lives in map-key.ts, which is NOT committed (.gitignore); see map-key.example.ts.
 * Both providers REQUIRE their credit on the map (the attribution below).
 */
export interface MapTiles {
  url: string;
  attribution: string;
  maxZoom: number;
  /** MapTiler's tiles are 512 px: drawn one zoom level "lower" so streets keep their normal size. */
  tileSize: number;
  zoomOffset: number;
}

export function mapTilesFor(mapTilerKey: string): MapTiles {
  const key = mapTilerKey.trim();
  if (key) {
    return {
      // {r} becomes "@2x" on high-density screens (Leaflet): the sharp version.
      url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
      attribution: '© MapTiler © OpenStreetMap contributors',
      maxZoom: 20,
      tileSize: 512,
      zoomOffset: -1,
    };
  }
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    tileSize: 256,
    zoomOffset: 0,
  };
}
