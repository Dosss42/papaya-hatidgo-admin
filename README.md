# Papaya HatidGo Admin

The administrators' website for Papaya HatidGo (Phase 14): verify drivers' papers, watch live rides, manage users, fares, settings, plans and payments, and read reports and the audit log.

- **Built with:** Angular 22 + Tailwind CSS 4, themed with the mobile app's DESIGN.md tokens.
- **Talks to:** the same Laravel API as the app (`papaya-hatidgo-api`, `/api/v1/admin/*`).
- **Who can log in:** only users with `role = admin`. Passengers and drivers are refused and their token is revoked.
- **Plan and decisions:** `papaya-hatid-go/docs/phase-14-admin-web.md`.

## Run it (development)

1. Start the API: WAMP (MySQL) running, then in `papaya-hatidgo-api` run `php artisan serve`.
2. In this folder:
   ```powershell
   npm install
   npm start
   ```
3. Open **http://localhost:4300** and log in with the admin account (dev seed: `admin@example.test` / `password`).

Port 4300, so it can run next to the mobile app's `npm start` (4200).

## The live map's key (MapTiler)

The map uses MapTiler "Streets" when `src/environments/map-key.ts` has a key; otherwise OpenStreetMap.

- `map-key.ts` is **git-ignored**: the key is never committed.
- `npm start` / `build` / `test` create it, empty, from `map-key.example.ts` if it's missing.
- Paste the key into it: `export const MAPTILER_KEY = '…';`

## Tests and build

```powershell
npm test          # unit tests (Vitest)
npm run build     # production build → dist/
```

## Before release

- Put the real HTTPS API address in `src/environments/environment.prod.ts`.
- Restrict the API's CORS to the admin website's address.
- Restrict the MapTiler key in the MapTiler account.
