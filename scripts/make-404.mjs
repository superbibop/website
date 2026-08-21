/* GitHub Pages serves 404.html for any unknown path — so an identical copy of
 * index.html makes /dashboard, /calendar, … serve the SPA. The app reads the
 * path and renders the right view. (Status stays 404, which is the standard
 * gh-pages SPA trade-off; browsers don't care.) */
import { copyFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dist/404.html');
console.log('dist/404.html written (SPA fallback for path routing)');
