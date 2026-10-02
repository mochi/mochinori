import {defineConfig} from 'vite';
import {voidPlugin} from 'void';

export default defineConfig({
  plugins: [voidPlugin()],
  // The Docusaurus site (@mochinori/website) builds into its build/
  // directory, which becomes the static assets of this Worker.
  publicDir: '../mochinori-website/build',
});
