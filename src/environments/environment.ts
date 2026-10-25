import { MAPTILER_KEY } from './map-key';
import { mapTilesFor } from './map-tiles';

// Development: `npm start` (http://localhost:4300) against `php artisan serve` on 127.0.0.1:8000.
export const environment = {
  production: false,
  apiUrl: 'http://127.0.0.1:8000/api/v1',
  // The live map's tiles: MapTiler with a key (map-key.ts, git-ignored), else OpenStreetMap.
  mapTiles: mapTilesFor(MAPTILER_KEY),
};
