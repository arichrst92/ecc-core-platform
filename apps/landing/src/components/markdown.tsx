import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Render markdown content dari backend (news body, legal docs, event description).
 * - GFM support (tables, strikethrough, task lists, autolinks)
 * - No raw HTML (security — backend content trusted tapi defensive)
 * - Tailwind prose-style classes via wrapper
 */
export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div
      className={
        className ??
        'prose prose-neutral max-w-none ' +
          'prose-headings:font-bold prose-headings:text-neutral-900 ' +
          'prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl ' +
          'prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline ' +
          'prose-img:rounded-lg prose-img:my-6 ' +
          'prose-blockquote:border-brand-300 prose-blockquote:text-neutral-600 ' +
          'prose-code:bg-neutral-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-brand-700 prose-code:before:content-none prose-code:after:content-none'
      }
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
