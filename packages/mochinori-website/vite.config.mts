import {defineConfig} from 'vite';
import {voidPlugin} from 'void';

export default defineConfig({
  plugins: [voidPlugin()],
  // `docusaurus build` emits the site into build/, which becomes the static
  // assets of the Void build. See void.config.ts.
  publicDir: 'build',
});
