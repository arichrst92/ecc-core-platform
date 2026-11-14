/**
 * Ekspor isi Technical Documentation & User Guide Portal ke Markdown
 * (Developer Tools → Download). Sumbernya sama dengan halaman Portal,
 * jadi unduhan selalu sesuai versi yang sedang berjalan.
 */
import { SECTIONS as TECH, type Block } from './tech-docs-content';
import { SECTIONS as GUIDE, type ContentBlock } from './user-guide-content';

const stamp = () => new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

function techBlock(b: Block): string {
  switch (b.kind) {
    case 'p':
      return b.text;
    case 'code':
      return '```' + (b.lang ?? '') + '\n' + b.content.replace(/\n+$/, '') + '\n```';
    case 'list':
      return b.items.map((i) => `- ${i}`).join('\n');
    case 'table':
      return [
        `| ${b.headers.join(' | ')} |`,
        `|${b.headers.map(() => '---').join('|')}|`,
        ...b.rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`),
      ].join('\n');
    case 'callout':
      return `> **${b.variant === 'warning' ? 'Perhatian' : b.variant === 'success' ? 'Catatan' : 'Info'}:** ${b.text}`;
    case 'mermaid':
      return `${b.caption ? `*${b.caption}*\n\n` : ''}\`\`\`mermaid\n${b.content.replace(/\n+$/, '')}\n\`\`\``;
  }
}

export function techDocsMarkdown(): string {
  const out = [
    '# ECC — Workflow & Technical Documentation',
    '',
    `Diekspor dari Portal (Developer Tools → Technical Documentation) · ${stamp()} WIB`,
    '',
    '## Daftar isi',
    '',
    ...TECH.map((s, i) => `${i + 1}. ${s.title} — ${s.summary}`),
  ];
  for (const s of TECH) {
    out.push('', `## ${s.title}`, '', `_${s.summary}_`);
    for (const b of s.blocks) out.push('', techBlock(b));
  }
  return out.join('\n') + '\n';
}

function guideBlock(b: ContentBlock): string {
  switch (b.kind) {
    case 'paragraph':
      return b.text;
    case 'steps':
      return `${b.title ? `**${b.title}**\n\n` : ''}${b.items.map((i, n) => `${n + 1}. ${i}`).join('\n')}`;
    case 'bullet':
      return `${b.title ? `**${b.title}**\n\n` : ''}${b.items.map((i) => `- ${i}`).join('\n')}`;
    case 'tip':
      return `> **Tips:** ${b.text}`;
    case 'warning':
      return `> **Perhatian:** ${b.text}`;
    case 'menu-card':
      return `- **${b.label}** (\`${b.href}\`) — ${b.description}`;
  }
}

export function userGuideMarkdown(): string {
  const out = [
    '# ECC Portal — User Guide',
    '',
    `Diekspor dari Portal (User Guide) · ${stamp()} WIB`,
    '',
    '## Daftar isi',
    '',
    ...GUIDE.map((s, i) => `${i + 1}. ${s.title} — ${s.summary}`),
  ];
  for (const s of GUIDE) {
    out.push('', `## ${s.title}`, '', `_${s.summary}_`);
    for (const b of s.content) out.push('', guideBlock(b));
  }
  return out.join('\n') + '\n';
}
