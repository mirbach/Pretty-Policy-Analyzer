import { useState, type RefObject } from 'react';
import { Copy, Check, FileCode, Image as ImageIcon, Download } from 'lucide-react';
import { toBlob } from 'html-to-image';
import { downloadBlobFile } from '../lib/download';

type CopyKind = 'text' | 'markdown' | 'image';

interface Props {
  /** Raw AI markdown source. */
  markdown: string;
  /** The rendered <ReactMarkdown> container to read "as shown" text/image from. */
  targetRef: RefObject<HTMLElement | null>;
  /** Used for the image-download fallback filename (no extension). */
  filenameBase: string;
  /** compact = icon-only, for tight spaces like per-setting rows. */
  variant?: 'default' | 'compact';
}

const BUTTON_BASE =
  'flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors disabled:opacity-50';

export function CopyExportToolbar({ markdown, targetRef, filenameBase, variant = 'default' }: Props) {
  const [status, setStatus] = useState<{ kind: CopyKind; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const compact = variant === 'compact';

  const flash = (kind: CopyKind, label: string) => {
    setStatus({ kind, label });
    setTimeout(() => setStatus((s) => (s?.kind === kind ? null : s)), 2000);
  };

  const handleCopyText = async () => {
    const text = targetRef.current?.innerText ?? markdown;
    await navigator.clipboard.writeText(text);
    flash('text', 'Copied');
  };

  const handleCopyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    flash('markdown', 'Copied');
  };

  const handleCopyImage = async () => {
    const node = targetRef.current;
    if (!node) return;
    setBusy(true);
    const prevMaxHeight = node.style.maxHeight;
    const prevOverflow = node.style.overflow;
    node.style.maxHeight = 'none';
    node.style.overflow = 'visible';
    try {
      const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true });
      if (!blob) throw new Error('Image render failed');
      if (typeof window.ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        flash('image', 'Copied');
      } else {
        downloadBlobFile(blob, `${filenameBase}.png`);
        flash('image', 'Downloaded');
      }
    } catch {
      const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true }).catch(() => null);
      if (blob) {
        downloadBlobFile(blob, `${filenameBase}.png`);
        flash('image', 'Downloaded');
      }
    } finally {
      node.style.maxHeight = prevMaxHeight;
      node.style.overflow = prevOverflow;
      setBusy(false);
    }
  };

  const renderIcon = (kind: CopyKind, Icon: typeof Copy) =>
    status?.kind === kind ? <Check size={12} /> : <Icon size={12} />;

  const renderLabel = (kind: CopyKind, defaultLabel: string) =>
    status?.kind === kind ? status.label : defaultLabel;

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={handleCopyText} title="Copy as plain text" className={BUTTON_BASE}>
        {renderIcon('text', Copy)}
        {!compact && renderLabel('text', 'Text')}
      </button>
      <button type="button" onClick={handleCopyMarkdown} title="Copy as Markdown" className={BUTTON_BASE}>
        {renderIcon('markdown', FileCode)}
        {!compact && renderLabel('markdown', 'Markdown')}
      </button>
      <button
        type="button"
        onClick={handleCopyImage}
        disabled={busy}
        title="Copy as image (downloads if clipboard image copy isn't supported)"
        className={BUTTON_BASE}
      >
        {busy
          ? <span className="w-3 h-3 border border-surface-400 border-t-transparent rounded-full animate-spin" />
          : status?.kind === 'image'
            ? (status.label === 'Downloaded' ? <Download size={12} /> : <Check size={12} />)
            : <ImageIcon size={12} />}
        {!compact && renderLabel('image', 'Image')}
      </button>
    </div>
  );
}
