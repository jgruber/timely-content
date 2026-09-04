import { Link } from 'react-router-dom';
import { Card, Badge, Button, Icon } from './ui.jsx';
import { formatBytes, relativeDate } from '../lib/format.js';
import { ownerDownloadUrl } from '../lib/api.js';

function UsageBadge({ item }) {
  if (item.maxAccesses === null) {
    return <Badge tone="accent"><Icon name="infinity" className="h-3.5 w-3.5" />Unlimited</Badge>;
  }
  if (item.exhausted) {
    return <Badge tone="danger">Limit reached</Badge>;
  }
  return <Badge tone="neutral">{item.remaining} of {item.maxAccesses} left</Badge>;
}

export default function ContentCard({ item, onShare, onManage, onDelete }) {
  const isMarkdown = item.kind === 'markdown';

  return (
    <Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-accent-soft p-2 text-accent">
          <Icon name={isMarkdown ? 'doc' : 'file'} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-ink" title={item.title}>{item.title}</h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            {isMarkdown ? 'Markdown' : (item.filename || 'File')} &middot; {formatBytes(item.size)}
            {' '}&middot; opened {relativeDate(item.lastAccessAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <UsageBadge item={item} />
        {item.deleteOnExhaust && item.maxAccesses !== null && (
          <Badge tone="danger"><Icon name="trash" className="h-3.5 w-3.5" />Deletes at limit</Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button variant="secondary" className="flex-1 px-3 sm:flex-none" onClick={() => onShare(item)}>
          <Icon name="qr" className="h-4 w-4" />
          Share
        </Button>

        {isMarkdown ? (
          <Link
            to={`/edit/${item.id}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2.5
              text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <Icon name="edit" className="h-4 w-4" />
            Edit
          </Link>
        ) : (
          <a
            href={ownerDownloadUrl(item.id)}
            download
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2.5
              text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <Icon name="download" className="h-4 w-4" />
            Download
          </a>
        )}

        <Button variant="ghost" className="px-3" onClick={() => onManage(item)}>
          <Icon name="refresh" className="h-4 w-4" />
          Manage
        </Button>

        <Button
          variant="ghost"
          className="ml-auto px-3 text-danger hover:bg-danger-soft hover:text-danger"
          onClick={() => onDelete(item)}
          aria-label={`Delete ${item.title}`}
        >
          <Icon name="trash" className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
