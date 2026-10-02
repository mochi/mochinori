import type {JSX} from 'react';

import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HomepageProjects from '@site/src/components/HomepageProjects';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import ThemedImage from '@theme/ThemedImage';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={styles.hero}>
      <div className="container">
        <ThemedImage
          alt=""
          className={styles.mark}
          height={160}
          sources={{
            dark: useBaseUrl('/img/logo/mochinori-mark-dark.svg'),
            light: useBaseUrl('/img/logo/mochinori-mark.svg'),
          }}
          width={160}
        />
        <Heading as="h1" className={styles.title}>
          {siteConfig.title}
        </Heading>
        <p className={styles.tagline}>{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            Get started
          </Link>
          <Link className="button button--secondary button--lg" to="/demos">
            Try the demos
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout description={siteConfig.tagline} title="Home">
      <HomepageHeader />
      <main>
        <section className={styles.section}>
          <div className="container">
            <Heading as="h2" className={styles.sectionTitle}>
              Projects
            </Heading>
            <HomepageProjects />
          </div>
        </section>
      </main>
    </Layout>
  );
}
