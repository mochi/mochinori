import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import {voidPlugin} from 'void';

// The Docusaurus site (@mochinori/website) builds into its build/
// directory, which becomes the static assets of this Worker.
const siteBuild = fileURLToPath(
  new URL('../mochinori-website/build', import.meta.url),
);

export default defineConfig(({command}) => {
  // `void deploy` runs `vite build` without building the site, so a missing
  // site build would otherwise deploy a Worker that answers every page
  // with a 404.
  if (command === 'build' && !existsSync(`${siteBuild}/index.html`)) {
    throw new Error(
      `No Docusaurus build in ${siteBuild}. Run \`pnpm --filter @mochinori/website run build\` first.`,
    );
  }
  return {
    plugins: [voidPlugin()],
    publicDir: siteBuild,
  };
});
