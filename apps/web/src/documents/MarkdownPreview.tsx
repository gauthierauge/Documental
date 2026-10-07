import { Fragment, type ReactNode } from 'react';
import { type Block, type Inline, parseMarkdown } from '@/documents/markdown-parser';
import '@/documents/documents.css';

function inlines(nodes: Inline[]): ReactNode {
  return nodes.map((node) => <Fragment key={JSON.stringify(node)}>{inline(node)}</Fragment>);
}

function inline(node: Inline): ReactNode {
  switch (node.type) {
    case 'texte':
      return node.value;
    case 'code':
      return <code className="doc-code-bref">{node.value}</code>;
    case 'fort':
      return <strong>{inlines(node.children)}</strong>;
    case 'accent':
      return <em>{inlines(node.children)}</em>;
    case 'image':
      return <img src={node.src} alt={node.alt} loading="lazy" className="doc-image" />;
    case 'lien':
      return node.externe ? (
        <a href={node.href} target="_blank" rel="noopener noreferrer nofollow">
          {inlines(node.children)}
        </a>
      ) : (
        <a href={node.href}>{inlines(node.children)}</a>
      );
  }
}

function block(node: Block): ReactNode {
  switch (node.type) {
    case 'titre': {
      const Heading = `h${node.niveau}` as 'h2' | 'h3' | 'h4';
      return <Heading>{inlines(node.children)}</Heading>;
    }
    case 'paragraphe':
      return <p>{inlines(node.children)}</p>;
    case 'citation':
      return <blockquote>{inlines(node.children)}</blockquote>;
    case 'code':
      return (
        <pre className="doc-code">
          <code>{node.value}</code>
        </pre>
      );
    case 'filet':
      return <hr />;
    case 'liste': {
      const List = node.ordonnee ? 'ol' : 'ul';
      return (
        <List>
          {node.items.map((item) => (
            <li key={JSON.stringify(item)}>{inlines(item)}</li>
          ))}
        </List>
      );
    }
  }
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="doc-contenu">
      {blocks.map((node) => (
        <Fragment key={JSON.stringify(node)}>{block(node)}</Fragment>
      ))}
    </div>
  );
}
