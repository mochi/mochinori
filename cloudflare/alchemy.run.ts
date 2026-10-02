/**
 * The mochinori Cloudflare app, managed with alchemy (https://alchemy.run).
 *
 *   pnpm run cf:dev       run everything locally (no Cloudflare account needed)
 *   pnpm run cf:deploy    deploy the stage (default: $USER) to Cloudflare
 *   pnpm run cf:destroy   tear the stage down
 *
 * Pass `--stage <name>` to deploy a named stage, e.g. `--stage prod`.
 * See cloudflare/README.md for credentials and CI.
 */

import type {Counter} from './src/durable-objects/Counter.ts';

import alchemy from 'alchemy';
import {Assets, DurableObjectNamespace, Worker} from 'alchemy/cloudflare';
import {CloudflareStateStore} from 'alchemy/state';

const app = await alchemy('mochinori', {
  // Local runs keep state in .alchemy/. CI (or anyone sharing a stage) sets
  // ALCHEMY_STATE_TOKEN to keep state in a Worker on the Cloudflare account.
  stateStore: process.env.ALCHEMY_STATE_TOKEN
    ? scope => new CloudflareStateStore(scope)
    : undefined,
});

// Durable Objects. Each class lives in src/durable-objects/ and is exported
// from the Worker that hosts it.
export const counter = DurableObjectNamespace<Counter>('counter', {
  className: 'Counter',
  sqlite: true,
});

// The website: the Docusaurus build (packages/mochinori-website/build, made
// by `pnpm run build-website`) served as static assets, with the Worker in
// src/website/ handling /api/* only.
export const website = await Worker('website', {
  adopt: true,
  assets: {
    html_handling: 'auto-trailing-slash',
    not_found_handling: '404-page',
    run_worker_first: ['/api/*'],
  },
  bindings: {
    ASSETS: await Assets({path: '../packages/mochinori-website/build'}),
    COUNTER: counter,
  },
  // The newest date the workerd bundled with alchemy supports, for `cf:dev`
  compatibilityDate: '2026-07-15',
  entrypoint: './src/website/worker.ts',
  name: `mochinori-website-${app.stage}`,
  url: true,
});

export type WebsiteEnv = typeof website.Env;

console.log(`website: ${website.url}`);

await app.finalize();
