# Door2Door

Door-to-door knocking tracker. Installable web app (PWA) for iPhone.

- Data is stored on the phone (IndexedDB). Nothing is sent anywhere except map and address lookups.
- Never commit exported backups or CSVs: they contain residents' names and numbers.

## Develop
    npm install
    npm run dev      # local preview
    npm test         # logic, storage and flow tests
    npm run build    # production build into dist/

## Publish
The built site is served by GitHub Pages from the `docs/` folder on `main`.
    OUT_DIR=docs npm run build
