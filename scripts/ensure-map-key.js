// Creates src/environments/map-key.ts from map-key.example.ts when it doesn't exist yet
// (a fresh clone): the app then builds with OpenStreetMap until a MapTiler key is put in it.
// map-key.ts is in .gitignore, so the key is never committed. Runs before start/build/test.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'environments');
const target = path.join(dir, 'map-key.ts');
if (!fs.existsSync(target)) {
  fs.copyFileSync(path.join(dir, 'map-key.example.ts'), target);
  console.log('created src/environments/map-key.ts (no key: OpenStreetMap)');
}
