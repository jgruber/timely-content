import { useEffect, useRef } from 'react';
import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
import { useAuth } from '../lib/auth.jsx';
import { isDarkMode } from '../lib/theme.js';
import { Icon } from './ui.jsx';

const URL_ONLY = /^(https?:\/\/|mailto:)\S+$/i;

/**
 * Builds a text-labelled toolbar button. The stock Toast UI toolbar is
 * icon-only, which leaves people who do not already know markdown hunting for
 * the chain icon. Naming the important actions removes that guesswork.
 */
function labelledButton({ text, tooltip, command }) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'tc-tool-button';
  el.textContent = text;
  el.dataset.tcCommand = command;
  el.setAttribute('aria-label', tooltip);
  // Without this the button takes focus on mousedown, ProseMirror drops its
  // selection, and the command lands on an empty range -- wiping the text.
  el.addEventListener('mousedown', (e) => e.preventDefault());
  // No `command` key: clicks are handled by our own delegated listener, so
  // Toast UI must not try to exec a command name it does not know.
  return { el, tooltip, name: `tc-${command}` };
}

/**
 * Toast UI Editor wrapper, opening in WYSIWYG mode so the document looks like
 * the finished page while it is being written.
 *
 * The editor is created once and driven imperatively -- re-rendering it on
 * every keystroke would fight ProseMirror for the cursor. The callback lives
 * in a ref so a changing identity never forces a rebuild, and the current text
 * lives in a ref so it survives the rebuild a light/dark flip requires (Toast
 * UI bakes its theme in at construction time).
 *
 * `initialValue` is read only when the editor is first constructed. Parents
 * loading existing content should hold the editor back until it has arrived.
 */
export default function MarkdownEditor({ initialValue = '', onChange, height = '52vh' }) {
  const hostRef = useRef(null);
  const changeRef = useRef(onChange);
  const valueRef = useRef(initialValue);
  const { prefs } = useAuth();
  const dark = isDarkMode(prefs.mode);

  useEffect(() => { changeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const editor = new Editor({
      el: host,
      height,
      initialEditType: 'wysiwyg',
      previewStyle: 'vertical',
      initialValue: valueRef.current,
      usageStatistics: false,
      theme: dark ? 'dark' : 'light',
      autofocus: false,
      // Turns a bare www./https:// address into a working link without the
      // author needing to know link syntax.
      extendedAutolinks: true,
      linkAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      placeholder: 'Write your instructions here. Paste a link straight onto highlighted text to turn it into a hyperlink.',
      toolbarItems: [
        [
          labelledButton({ text: 'Normal', tooltip: 'Normal paragraph text', command: 'paragraph' }),
          labelledButton({ text: 'H1', tooltip: 'Large heading', command: 'h1' }),
          labelledButton({ text: 'H2', tooltip: 'Medium heading', command: 'h2' }),
          labelledButton({ text: 'H3', tooltip: 'Small heading', command: 'h3' }),
        ],
        ['bold', 'italic', 'strike'],
        ['ul', 'ol', 'task'],
        ['quote', 'hr'],
        ['link', 'table'],
        ['code', 'codeblock'],
      ],
      events: {
        change: () => {
          valueRef.current = editor.getMarkdown();
          changeRef.current?.(valueRef.current);
        },
      },
    });

    // Wire the heading buttons. Toast UI exposes heading level through the
    // 'heading' command; the toolbar entries above only supply the chrome.
    const headingCommands = {
      paragraph: () => editor.exec('heading', { level: 0 }),
      h1: () => editor.exec('heading', { level: 1 }),
      h2: () => editor.exec('heading', { level: 2 }),
      h3: () => editor.exec('heading', { level: 3 }),
    };
    const onToolbarClick = (e) => {
      const button = e.target.closest('.tc-tool-button');
      if (!button) return;
      e.preventDefault();
      headingCommands[button.dataset.tcCommand]?.();
      editor.focus();
    };
    host.addEventListener('click', onToolbarClick);

    // Ctrl/Cmd+K opens the link dialog, matching the shortcut people already
    // know from chat apps and docs editors.
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        host.querySelector('.toastui-editor-toolbar-icons.link')?.click();
      }
    };
    host.addEventListener('keydown', onKeyDown);

    /**
     * Paste a URL while text is highlighted and it becomes a hyperlink on that
     * text -- the behaviour people expect from every other editor. Rich HTML
     * pastes are left to Toast UI, which converts them to markdown itself.
     */
    const onPaste = (e) => {
      const clipboard = e.clipboardData;
      if (!clipboard) return;
      if (clipboard.getData('text/html')) return;

      const text = clipboard.getData('text/plain')?.trim();
      if (!text || !URL_ONLY.test(text)) return;

      const selected = editor.getSelectedText()?.trim();
      if (!selected) return;

      e.preventDefault();
      e.stopPropagation();
      editor.exec('addLink', { linkUrl: text, linkText: selected });
    };
    host.addEventListener('paste', onPaste, true);

    return () => {
      host.removeEventListener('click', onToolbarClick);
      host.removeEventListener('keydown', onKeyDown);
      host.removeEventListener('paste', onPaste, true);
      editor.destroy();
    };
  }, [dark, height]);

  return (
    <div>
      <div className="tc-editor" ref={hostRef} />
      <EditorTips />
    </div>
  );
}

function EditorTips() {
  const tips = [
    { icon: 'copy', text: 'Paste a web address onto highlighted text to make it a link' },
    { icon: 'key', text: 'Ctrl/⌘ + K inserts a link' },
    { icon: 'doc', text: 'Paste from a web page or document and the formatting comes with it' },
  ];
  return (
    <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-5">
      {tips.map((tip) => (
        <li key={tip.text} className="flex items-center gap-1.5">
          <Icon name={tip.icon} className="h-3.5 w-3.5 shrink-0" />
          {tip.text}
        </li>
      ))}
    </ul>
  );
}
