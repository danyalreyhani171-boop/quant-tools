import type { ReactNode } from "react";

/**
 * A deliberately tiny renderer for the markdown the agents produce in their
 * notes: paragraphs, bullet lists, `inline code` and **bold**.
 *
 * Model output is untrusted text, so nothing here ever builds HTML from a
 * string — every piece becomes a React node, which React escapes.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on `code` and **bold**, keeping the delimiters.
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  parts.forEach((part, index) => {
    if (!part) return;
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-ink-700/70 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-200"
        >
          {part.slice(1, -1)}
        </code>,
      );
      return;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      nodes.push(
        <strong key={key} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>,
      );
      return;
    }
    nodes.push(<span key={key}>{part}</span>);
  });

  return nodes;
}

export default function Prose({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let paragraph: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = [...bullets];
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-0.5 space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2.5">
            <span aria-hidden className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-brand-400/70" />
            <span className="min-w-0">{renderInline(item, `li-${index}`)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = paragraph.join(" ");
    paragraph = [];
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed">
        {renderInline(joined, `p-${blocks.length}`)}
      </p>,
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);

    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1] ?? "");
      continue;
    }
    if (line.trim() === "") {
      flushBullets();
      flushParagraph();
      continue;
    }
    // Strip any heading markers the agent left in a section body.
    flushBullets();
    paragraph.push(line.replace(/^#{1,6}\s*/, ""));
  }

  flushBullets();
  flushParagraph();

  return <div className="space-y-3 text-sm text-slate-300">{blocks}</div>;
}
