/**
 * Markdown sederhana Announcement → teks polos / format WhatsApp / HTML email.
 * Sintaks yang didukung (sama dengan toolbar Portal):
 *   **tebal**  *miring* / _miring_  ~~coret~~  # / ## / ### judul
 *   - atau * daftar   1. daftar bernomor   > kutipan   [teks](https://url)
 * Fungsi murni (tanpa DB) supaya mudah diuji.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeUrl = (u: string) => (/^(https?:\/\/|mailto:)/i.test(u.trim()) ? u.trim() : null);

/** Inline: tebal, miring, coret, link — untuk HTML (input sudah di-escape). */
function inlineHtml(text: string): string {
  let t = esc(text);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const u = safeUrl(url.replace(/&amp;/g, '&'));
    return u ? `<a href="${esc(u)}" style="color:#EA580C">${label}</a>` : label;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  t = t.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  return t;
}

/** Markdown → HTML aman (untuk email). */
export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p style="margin:0 0 12px">${para.map(inlineHtml).join('<br>')}</p>`);
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpExecArray | null;
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flushPara();
      closeList();
      const size = m[1]!.length === 1 ? 20 : m[1]!.length === 2 ? 17 : 15;
      out.push(`<p style="margin:16px 0 8px;font-size:${size}px;font-weight:700">${inlineHtml(m[2]!)}</p>`);
      continue;
    }
    if ((m = /^\s*[-*]\s+(.*)$/.exec(line)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      const kind = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        out.push(`<${kind} style="margin:0 0 12px;padding-left:20px">`);
        list = kind;
      }
      out.push(`<li style="margin:0 0 4px">${inlineHtml(m[1]!)}</li>`);
      continue;
    }
    if ((m = /^>\s?(.*)$/.exec(line))) {
      flushPara();
      closeList();
      out.push(
        `<p style="margin:0 0 12px;padding:8px 12px;border-left:3px solid #FDBA74;background:#FFF7ED;color:#7C2D12">${inlineHtml(m[1]!)}</p>`,
      );
      continue;
    }
    closeList();
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join('\n');
}

/** Markdown → format WhatsApp (*tebal*, _miring_, ~coret~, • daftar). Link jadi "teks (url)". */
export function mdToWhatsApp(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      let l = line.trimEnd();
      let m: RegExpExecArray | null;
      if ((m = /^#{1,3}\s+(.*)$/.exec(l))) l = `**${m[1]!.replace(/\*\*/g, '')}**`;
      else if ((m = /^\s*[-*]\s+(.*)$/.exec(l))) l = `• ${m[1]}`;
      else if ((m = /^>\s?(.*)$/.exec(l))) l = `> ${m[1]}`;
      l = l.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_x, label: string, url: string) => (safeUrl(url) ? `${label} (${url})` : label));
      // **tebal** → sementara penanda, supaya *miring* tidak salah tangkap.
      l = l.replace(/\*\*([^*]+)\*\*/g, '\u0001$1\u0001');
      l = l.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1_$2_');
      l = l.replace(/\u0001/g, '*');
      l = l.replace(/~~([^~]+)~~/g, '~$1~');
      return l;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Markdown → teks polos (isi notifikasi, ringkasan). */
export function mdToPlain(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^>\s?/gm, '')
    .replace(/(\*\*|__|~~|\*|_)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
