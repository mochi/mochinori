import {defineConfig} from 'void/config';

export default defineConfig({
  cloudflare: {
    name: 'mochinori-website',
  },
  inference: {
    // Docusaurus is detected as a static site; the routes/ and
    // durable-objects/ backend makes it a Void app built after the site.
    appType: 'void',
    build: 'docusaurus build && vite build',
  },
  routing: {
    // Unknown URLs get Docusaurus's own 404.html with a real 404 status
    notFound: '404-page',
  },
  worker: {
    compatibility_date: '2026-07-15',
  },
});
