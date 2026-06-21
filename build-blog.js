/**
 * Briefcase Blog Builder
 * 
 * Converts markdown blog posts from /home/team/shared/content/ into HTML pages.
 * Run: node build-blog.js
 * 
 * Each post file should have this format:
 *   # Title
 *   **Meta Title:** ...
 *   **Meta Description:** ...
 *   **Focus Keyword:** ...
 *   **Secondary Keywords:** ...
 *   ---
 *   Body content in markdown...
 */

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = '/home/team/shared/content';
const OUTPUT_DIR = path.join(__dirname, 'blog');
const TEMPLATES_DIR = '/home/team/shared/templates/blog';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ─── Simple Markdown → HTML Converter ─────────────────────

function mdToHtml(md) {
  let html = '';
  const lines = md.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip separator lines
    if (line.trim() === '---' && i > 1) {
      html += '<hr>\n';
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const content = renderInline(hMatch[2]);
      html += `<h${level}>${content}</h${level}>\n`;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      // Check if previous line was also a list item
      const content = renderInline(ulMatch[2]);
      html += `<li>${content}</li>\n`;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      const content = renderInline(olMatch[2]);
      html += `<li>${content}</li>\n`;
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^>\s*(.*)/);
    if (bqMatch) {
      html += `<blockquote><p>${renderInline(bqMatch[1])}</p></blockquote>\n`;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      html += '\n';
      continue;
    }

    // Regular paragraph
    html += `<p>${renderInline(line)}</p>\n`;
  }

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/((?:<li>.*?<\/li>\n)+)/g, (match) => {
    return `<ul>\n${match}</ul>\n`;
  });

  // Clean up double-wrapping
  html = html.replace(/<\/ul>\n<ul>\n/g, '');
  html = html.replace(/<\/p>\n<p>/g, '</p>\n<p>');

  return html.trim();
}

function renderInline(text) {
  let t = text;
  // Bold
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Strikethrough
  t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Inline code
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  return t;
}

// ─── Slug from filename ──────────────────────────────────

function slugFromFile(filename) {
  return filename
    .replace(/^blog-post-\d+-/, '')
    .replace(/\.md$/, '')
    .toLowerCase();
}

function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

// ─── Parse Post ──────────────────────────────────────────

function parsePost(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let title = '';
  let metaTitle = '';
  let metaDescription = '';
  let focusKeyword = '';
  let secondaryKeywords = '';
  let bodyStart = 0;

  // First line should be the H1 title
  const titleMatch = lines[0].match(/^#\s+(.+)/);
  if (titleMatch) title = titleMatch[1];

  // Extract meta fields
  for (let i = 1; i < lines.length; i++) {
    const mt = lines[i].match(/^\*\*Meta Title:\*\*\s*(.+)/);
    if (mt) { metaTitle = mt[1]; continue; }
    const md = lines[i].match(/^\*\*Meta Description:\*\*\s*(.+)/);
    if (md) { metaDescription = md[1]; continue; }
    const fk = lines[i].match(/^\*\*Focus Keyword:\*\*\s*(.+)/);
    if (fk) { focusKeyword = fk[1]; continue; }
    const sk = lines[i].match(/^\*\*Secondary Keywords:\*\*\s*(.+)/);
    if (sk) { secondaryKeywords = sk[1]; continue; }

    // After the meta header block, find the separator
    if (lines[i].trim() === '---' && i > 3) {
      bodyStart = i + 1;
      break;
    }
  }

  // Body is everything from bodyStart to end
  const bodyMd = lines.slice(bodyStart).join('\n');
  const bodyHtml = mdToHtml(bodyMd);

  return {
    title,
    metaTitle: metaTitle || `${title} | Briefcase`,
    metaDescription: metaDescription || 'Read the Briefcase blog for productivity tips and organization guides.',
    focusKeyword,
    secondaryKeywords,
    bodyHtml,
    slug: titleToSlug(title),
  };
}

// ─── Generate Blog Post HTML ─────────────────────────────

const POST_TEMPLATE = (post, prev, next) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(post.metaTitle)}</title>
  <meta name="description" content="${escHtml(post.metaDescription)}">
  <meta name="keywords" content="${escHtml(post.focusKeyword)}, ${escHtml(post.secondaryKeywords)}">
  <link rel="canonical" href="https://briefcase.so/blog/${post.slug}.html">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>💼</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/blog.css">
</head>
<body>
  <header class="nav">
    <div class="container">
      <a href="/" class="logo">
        <span class="logo-icon">💼</span>
        <span class="logo-text">Briefcase</span>
      </a>
      <nav class="nav-links">
        <a href="/">Home</a>
        <a href="/#products">Templates</a>
        <a href="/blog/" class="active">Blog</a>
        <a href="/#faq">FAQ</a>
      </nav>
    </div>
  </header>

  <article class="blog-post">
    <div class="container blog-container">
      <div class="post-header">
        <a href="/blog/" class="back-link">← Back to Blog</a>
        <h1>${escHtml(post.title)}</h1>
      </div>
      <div class="post-content">
        ${post.bodyHtml}
      </div>
      <div class="post-nav">
        ${prev ? `<a href="/blog/${prev.slug}.html" class="post-nav-link prev">← ${escHtml(prev.title)}</a>` : '<div></div>'}
        ${next ? `<a href="/blog/${next.slug}.html" class="post-nav-link next">${escHtml(next.title)} →</a>` : ''}
      </div>
    </div>
  </article>

  <section class="cta">
    <div class="container">
      <h2>Ready to get organized?</h2>
      <p>Browse our premium templates and start working smarter today.</p>
      <a href="/#products" class="btn btn-primary btn-lg">
        Browse Templates
        <span class="btn-arrow">→</span>
      </a>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <div class="footer-content">
        <div class="footer-brand">
          <div class="logo">
            <span class="logo-icon">💼</span>
            <span class="logo-text">Briefcase</span>
          </div>
          <p>Premium digital templates for solopreneurs and professionals.</p>
        </div>
        <div class="footer-links">
          <h4>Pages</h4>
          <a href="/#products">Templates</a>
          <a href="/blog/">Blog</a>
          <a href="/#faq">FAQ</a>
        </div>
        <div class="footer-links">
          <h4>Support</h4>
          <a href="/#faq">FAQ</a>
          <a href="mailto:support@briefcase.so">Contact Us</a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 Briefcase. All rights reserved.</p>
      </div>
    </div>
  </footer>
</body>
</html>`;

// ─── Generate Blog Index HTML ────────────────────────────

function generateIndex(posts) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog — Briefcase | Productivity Tips & Templates</title>
  <meta name="description" content="Discover productivity tips, organization guides, and digital template recommendations for solopreneurs and professionals on the Briefcase blog.">
  <link rel="canonical" href="https://briefcase.so/blog/">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>💼</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/blog.css">
</head>
<body>
  <header class="nav">
    <div class="container">
      <a href="/" class="logo">
        <span class="logo-icon">💼</span>
        <span class="logo-text">Briefcase</span>
      </a>
      <nav class="nav-links">
        <a href="/">Home</a>
        <a href="/#products">Templates</a>
        <a href="/blog/" class="active">Blog</a>
        <a href="/#faq">FAQ</a>
      </nav>
    </div>
  </header>

  <section class="blog-index">
    <div class="container">
      <div class="blog-index-header">
        <h1>Briefcase Blog</h1>
        <p>Productivity tips, organization guides, and digital template recommendations for solopreneurs and professionals.</p>
      </div>
      <div class="blog-grid">
        ${posts.map((post, i) => `
        <article class="blog-card">
          <a href="/blog/${post.slug}.html" class="blog-card-link">
            <div class="blog-card-body">
              <div class="blog-card-number">${String(i + 1).padStart(2, '0')}</div>
              <h2>${escHtml(post.title)}</h2>
              <p>${escHtml(post.metaDescription)}</p>
              <span class="blog-card-cta">Read Article →</span>
            </div>
          </a>
        </article>
        `).join('\n')}
      </div>
    </div>
  </section>

  <section class="cta">
    <div class="container">
      <h2>Ready to put these tips into action?</h2>
      <p>Our premium templates make it easy to implement what you've learned.</p>
      <a href="/#products" class="btn btn-primary btn-lg">
        Browse Templates
        <span class="btn-arrow">→</span>
      </a>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <div class="footer-content">
        <div class="footer-brand">
          <div class="logo">
            <span class="logo-icon">💼</span>
            <span class="logo-text">Briefcase</span>
          </div>
          <p>Premium digital templates for solopreneurs and professionals.</p>
        </div>
        <div class="footer-links">
          <h4>Pages</h4>
          <a href="/#products">Templates</a>
          <a href="/blog/">Blog</a>
          <a href="/#faq">FAQ</a>
        </div>
        <div class="footer-links">
          <h4>Support</h4>
          <a href="/#faq">FAQ</a>
          <a href="mailto:support@briefcase.so">Contact Us</a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 Briefcase. All rights reserved.</p>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

// ─── Utility ──────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Main ─────────────────────────────────────────────────

function main() {
  const files = fs.readdirSync(CONTENT_DIR)
    .filter(f => f.startsWith('blog-post-') && f.endsWith('.md'))
    .sort();

  const posts = files.map(f => {
    const filePath = path.join(CONTENT_DIR, f);
    return parsePost(filePath);
  });

  console.log(`Found ${posts.length} blog posts.`);

  // Generate individual post pages
  for (let i = 0; i < posts.length; i++) {
    const prev = i > 0 ? posts[i - 1] : null;
    const next = i < posts.length - 1 ? posts[i + 1] : null;
    const html = POST_TEMPLATE(posts[i], prev, next);
    const outPath = path.join(OUTPUT_DIR, `${posts[i].slug}.html`);
    fs.writeFileSync(outPath, html);
    console.log(`  ✓ ${posts[i].slug}.html — "${posts[i].title}"`);
  }

  // Generate blog index
  const indexHtml = generateIndex(posts);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml);
  console.log(`  ✓ index.html — Blog index with ${posts.length} posts`);
  console.log(`\nDone! Blog pages generated in ${OUTPUT_DIR}`);
}

main();