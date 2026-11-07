import type {JSX} from 'react';

import BrowserOnly from '@docusaurus/BrowserOnly';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import {NOTO_COLOR_EMOJI_STYLESHEET} from '@mochinori/emoji';
import EmojiDemo from '@site/src/components/EmojiDemo';
import ImagesDemo from '@site/src/components/ImagesDemo';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';

export default function Demos(): JSX.Element {
  return (
    <Layout description="Live demos of mochinori packages" title="Demos">
      <Head>
        {/* The emoji demo's Noto font, linked in the page's HTML rather than
            added by EmojiExtension (emojiFontStylesheet: ''), which is what
            a page with a Content Security Policy does */}
        <link href={NOTO_COLOR_EMOJI_STYLESHEET} rel="stylesheet" />
      </Head>
      <main className="container margin-vert--xl">
        <Heading as="h1">Demos</Heading>
        <p>Each demo is a real Lexical editor running in your browser.</p>

        <section className="margin-top--lg">
          <Heading as="h2" id="images">
            <code>@mochinori/images</code>
          </Heading>
          <p>
            Insert images into a rich text editor. Upload, resizing and captions
            are coming next; see the{' '}
            <Link to="/docs/packages/images">docs</Link> for the plan.
          </p>
          <BrowserOnly fallback={<div>Loading editor…</div>}>
            {() => <ImagesDemo />}
          </BrowserOnly>
        </section>

        <section className="margin-top--lg">
          <Heading as="h2" id="emoji">
            <code>@mochinori/emoji</code>
          </Heading>
          <p>
            Shortcodes turn into emoji as you type, shown with the same images
            on every platform. Type <code>:app</code> for suggestions, browse
            the picker's categories, pick a skin tone, add custom emoji while
            the editor runs, or open the Markdown below the editor. See the{' '}
            <Link to="/docs/packages/emoji">docs</Link>.
          </p>
          <BrowserOnly fallback={<div>Loading editor…</div>}>
            {() => <EmojiDemo />}
          </BrowserOnly>
        </section>
      </main>
    </Layout>
  );
}
