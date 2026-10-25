import { MAPTILER_KEY } from './map-key';
import { mapTilesFor } from './map-tiles';

// Production: swapped in by `ng build` (angular.json → fileReplacements).
export const environment = {
  production: true,
  // The real HTTPS API address, set when the backend is deployed.
  apiUrl: 'https://api.example.invalid/api/v1',
  mapTiles: mapTilesFor(MAPTILER_KEY),
};
