import {defineConfig} from 'void/config';

export default defineConfig({
  cloudflare: {
    name: 'mochinori-website',
    // Demo image uploads (routes/api/images). Objects expire after an hour;
    // see server/imageUploads.ts and crons/expire-demo-images.ts.
    r2_buckets: [{binding: 'STORAGE', bucket_name: 'mochinori-demo-uploads'}],
    // Served at the apex of the zone in the same Cloudflare account. Pull
    // request previews drop this (see .github/workflows/preview.yml).
    routes: [{custom_domain: true, pattern: 'mochinori.com'}],
    // Keep the workers.dev URL too (with routes it defaults to off); Void
    // checks a new version there before sending it traffic.
    workers_dev: true,
  },
  inference: {
    // A Worker with routes/ and durable-objects/, whose static assets are
    // the Docusaurus build. Docusaurus lives in its own package
    // (@mochinori/website) so that Void does not detect this package as a
    // static site.
    appType: 'void',
    build: 'pnpm --filter @mochinori/website run build && vite build',
  },
  routing: {
    // Unknown URLs get Docusaurus's own 404.html with a real 404 status
    notFound: '404-page',
  },
  worker: {
    compatibility_date: '2026-07-15',
  },
});
