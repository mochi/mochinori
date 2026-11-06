import type {JSX} from 'react';

import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';

import styles from './styles.module.css';

interface Project {
  description: string;
  docs: string;
  demo?: string;
  name: string;
  status: 'In progress' | 'Stable';
}

const PROJECTS: Project[] = [
  {
    demo: '/demos#images',
    description:
      'An image node for Lexical with upload, resizing and captions, like the one in the Lexical playground but packaged for your editor.',
    docs: '/docs/packages/images',
    name: '@mochinori/images',
    status: 'In progress',
  },
  {
    demo: '/demos#emoji',
    description:
      'Type :tada: or :) and get an emoji node, drawn with the same images on every platform, with suggestions as you type, a headless picker with categories and skin tones, custom emoji like a Slack workspace has, and Markdown.',
    docs: '/docs/packages/emoji',
    name: '@mochinori/emoji',
    status: 'In progress',
  },
];

export default function HomepageProjects(): JSX.Element {
  return (
    <div className={styles.grid}>
      {PROJECTS.map(project => (
        <article className={styles.card} key={project.name}>
          <div className={styles.cardHeader}>
            <Heading as="h3" className={styles.name}>
              <code>{project.name}</code>
            </Heading>
            <span className="badge badge--secondary">{project.status}</span>
          </div>
          <p>{project.description}</p>
          <div className={styles.links}>
            <Link to={project.docs}>Docs</Link>
            {project.demo ? <Link to={project.demo}>Demo</Link> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
