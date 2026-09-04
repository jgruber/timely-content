import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

// Task lists normally emit <input type="checkbox">, but form controls are
// stripped during sanitising. Rendering them as inert spans keeps the visual
// checklist -- which matters for step-by-step instructions -- with no form
// elements in the output at all.
marked.use({
  renderer: {
    checkbox({ checked }) {
      return `<span class="md-check${checked ? ' is-checked' : ''}" role="img" `
        + `aria-label="${checked ? 'Done' : 'Not done'}"></span>`;
    },
  },
});

// Anything opened from a share link is treated as untrusted: force external
// links to open safely rather than inheriting this page's context.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

export function renderMarkdown(source) {
  const html = marked.parse(String(source ?? ''), { async: false });
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcset', 'formaction'],
    ALLOW_DATA_ATTR: false,
  });
}
