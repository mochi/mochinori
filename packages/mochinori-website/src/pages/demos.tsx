import type {JSX} from 'react';

import BrowserOnly from '@docusaurus/BrowserOnly';
import Link from '@docusaurus/Link';
import ImagesDemo from '@site/src/components/ImagesDemo';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';

export default function Demos(): JSX.Element {
  return (
    <Layout description="Live demos of mochinori packages" title="Demos">
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
      </main>
    </Layout>
  );
}
