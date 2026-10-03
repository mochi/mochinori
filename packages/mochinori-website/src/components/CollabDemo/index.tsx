import type {Provider} from '@lexical/yjs';
import type {JSX} from 'react';

import {LexicalCollaboration} from '@lexical/react/LexicalCollaborationContext';
import {CollaborationPlugin} from '@lexical/react/LexicalCollaborationPlugin';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {RichTextExtension} from '@lexical/rich-text';
import {defineExtension} from 'lexical';
import {useRef, useState} from 'react';
import YProvider from 'y-partyserver/provider';
import {Doc} from 'yjs';

import styles from './styles.module.css';

const DOCUMENT_NAME = /^[\w-]{1,64}$/;

/** The document named by `?doc=` in the page URL, or a new random one */
function useDocumentName(): string {
  const [name] = useState(() => {
    const url = new URL(globalThis.location.href);
    const requested = url.searchParams.get('doc');
    if (requested !== null && DOCUMENT_NAME.test(requested)) {
      return requested;
    }
    const created = crypto.randomUUID().slice(0, 8);
    url.searchParams.set('doc', created);
    globalThis.history.replaceState(null, '', url);
    return created;
  });
  return name;
}

type Status = 'connecting' | 'connected' | 'disconnected';

function createProviderFactory(onStatus: (status: Status) => void) {
  return (id: string, yjsDocMap: Map<string, Doc>): Provider => {
    let doc = yjsDocMap.get(id);
    if (doc === undefined) {
      doc = new Doc();
      yjsDocMap.set(id, doc);
    } else {
      doc.load();
    }
    // The site's Worker serves each document from its own Durable Object
    // (packages/mochinori-website-worker/durable-objects/collab.ts)
    const provider = new YProvider(globalThis.location.host, id, doc, {
      connect: false,
      // Without this, two editors in one page would sync through a
      // BroadcastChannel instead of the server
      disableBc: true,
      prefix: `/api/collab/${id}`,
      protocol: globalThis.location.protocol === 'https:' ? 'wss' : 'ws',
    });
    provider.on('status', ({status}: {status: Status}) => onStatus(status));
    // YProvider's awareness and events match what @lexical/yjs expects; its
    // TypeScript types are only declared more loosely
    return provider as unknown as Provider;
  };
}

const CollabEditorExtension = defineExtension({
  // Start empty: the content comes from the Yjs document, and only the
  // bootstrapping client seeds an empty one
  $initialEditorState: null,
  // CollaborationPlugin keeps its own undo history, so HistoryExtension
  // is left out
  dependencies: [RichTextExtension],
  name: '@mochinori/website/CollabDemo',
  namespace: 'CollabDemo',
  theme: {paragraph: styles.paragraph},
});

interface CollabEditorProps {
  color: string;
  documentName: string;
  label: string;
  shouldBootstrap: boolean;
}

function CollabEditor({
  color,
  documentName,
  label,
  shouldBootstrap,
}: CollabEditorProps): JSX.Element {
  const [status, setStatus] = useState<Status>('connecting');
  const cursorsContainerRef = useRef<HTMLDivElement>(null);
  const [providerFactory] = useState(() => createProviderFactory(setStatus));

  return (
    <div className={styles.pane}>
      <div className={styles.paneHeader}>
        <span className={styles.label}>
          <span className={styles.swatch} style={{background: color}} />
          {label}
        </span>
        <span aria-live="polite" className={styles.status}>
          {status}
        </span>
      </div>
      <LexicalCollaboration>
        <LexicalExtensionComposer
          contentEditable={null}
          extension={CollabEditorExtension}>
          <div className={styles.editorShell}>
            <ContentEditable
              aria-label={`Collaborative editor: ${label}`}
              className={styles.editor}
            />
            <div ref={cursorsContainerRef} />
          </div>
          <CollaborationPlugin
            cursorColor={color}
            cursorsContainerRef={cursorsContainerRef}
            id={documentName}
            providerFactory={providerFactory}
            // Only one client may seed an empty document, or each would
            // insert its own first paragraph
            shouldBootstrap={shouldBootstrap}
            username={label}
          />
        </LexicalExtensionComposer>
      </LexicalCollaboration>
    </div>
  );
}

export default function CollabDemo(): JSX.Element {
  const documentName = useDocumentName();
  // Rendered in the browser only (BrowserOnly), after useDocumentName has
  // put the document in the URL
  const shareUrl = globalThis.location.href;

  return (
    <div className={styles.demo}>
      <div className={styles.toolbar}>
        <span>
          Document <code>{documentName}</code>
        </span>
        <a
          className={styles.share}
          href={shareUrl}
          rel="noopener"
          target="_blank">
          Open it in another tab
        </a>
      </div>
      <div className={styles.panes}>
        <CollabEditor
          color="#e5484d"
          documentName={documentName}
          label="Ana"
          shouldBootstrap={true}
        />
        <CollabEditor
          color="#3e63dd"
          documentName={documentName}
          label="Ben"
          shouldBootstrap={false}
        />
      </div>
    </div>
  );
}
