import { Fragment, type ReactNode } from "react";

type MarkdownProps = {
  children: string;
  className?: string;
  allowInteractiveElements?: boolean;
};

const BLOCK_START = /^(#{1,6})\s+|^(```|~~~)|^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s?|(?:-{3,}|\*{3,}|_{3,})\s*$)/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function safeHref(value: string) {
  const href = value.trim();
  if (/^(https?:|mailto:)/i.test(href)) return href;
  return undefined;
}

function renderInline(source: string, keyPrefix: string, allowInteractiveElements: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`\n]+`|\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(source))) {
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index));
    const key = `${keyPrefix}-${index++}`;
    const token = match[0];

    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const href = safeHref(match[3]);
      nodes.push(href && allowInteractiveElements
        ? <a key={key} href={href} target="_blank" rel="noreferrer">{renderInline(match[2], `${key}-link`, allowInteractiveElements)}</a>
        : <Fragment key={key}>{renderInline(match[2], `${key}-link-text`, allowInteractiveElements)}</Fragment>);
    } else if (match[4] !== undefined || match[5] !== undefined) {
      const value = match[4] ?? match[5];
      nodes.push(<strong key={key}>{renderInline(value, `${key}-strong`, allowInteractiveElements)}</strong>);
    } else if (match[6] !== undefined) {
      nodes.push(<del key={key}>{renderInline(match[6], `${key}-del`, allowInteractiveElements)}</del>);
    } else {
      const value = match[7] ?? match[8] ?? "";
      nodes.push(<em key={key}>{renderInline(value, `${key}-em`, allowInteractiveElements)}</em>);
    }
    cursor = pattern.lastIndex;
  }

  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index] ?? "";
  return BLOCK_START.test(line)
    || (line.includes("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? ""));
}

function renderBlocks(source: string, allowInteractiveElements: boolean): ReactNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const key = `md-${blockIndex++}`;
    const fence = line.match(/^\s*(```|~~~)\s*([^\s]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      const language = fence[2];
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${marker}\\s*$`).test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={key}><code className={language ? `language-${language}` : undefined}>{code.join("\n")}</code></pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], key, allowInteractiveElements);
      if (level === 1) blocks.push(<h1 key={key}>{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={key}>{content}</h2>);
      else if (level === 3) blocks.push(<h3 key={key}>{content}</h3>);
      else if (level === 4) blocks.push(<h4 key={key}>{content}</h4>);
      else if (level === 5) blocks.push(<h5 key={key}>{content}</h5>);
      else blocks.push(<h6 key={key}>{content}</h6>);
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key} />);
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={key}>{renderBlocks(quote.join("\n"), allowInteractiveElements)}</blockquote>);
      continue;
    }

    if (line.includes("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? "")) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="markdown-table-wrap" key={key}>
          <table>
            <thead><tr>{headers.map((cell, cellIndex) => <th key={`${key}-h-${cellIndex}`}>{renderInline(cell, `${key}-h-${cellIndex}`, allowInteractiveElements)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => (
              <tr key={`${key}-r-${rowIndex}`}>{headers.map((_, cellIndex) => <td key={`${key}-r-${rowIndex}-${cellIndex}`}>{renderInline(row[cellIndex] ?? "", `${key}-r-${rowIndex}-${cellIndex}`, allowInteractiveElements)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const listMatch = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const items: Array<{ text: string; checked?: boolean }> = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
        if (!itemMatch || Boolean(itemMatch[2]) !== ordered) break;
        let text = itemMatch[3];
        let checked: boolean | undefined;
        const task = text.match(/^\[([ xX])\]\s+(.*)$/);
        if (task) {
          checked = task[1].toLowerCase() === "x";
          text = task[2];
        }
        items.push({ text, checked });
        index += 1;
      }
      const children = items.map((item, itemIndex) => (
        <li className={item.checked !== undefined ? "markdown-task-item" : undefined} key={`${key}-${itemIndex}`}>
          {item.checked !== undefined && (allowInteractiveElements
            ? <input type="checkbox" checked={item.checked} readOnly aria-label={item.checked ? "Completed" : "Not completed"} />
            : <span className="markdown-task-marker" aria-hidden="true">{item.checked ? "☑" : "☐"}</span>)}
          <span>{renderInline(item.text, `${key}-${itemIndex}`, allowInteractiveElements)}</span>
        </li>
      ));
      blocks.push(ordered ? <ol key={key}>{children}</ol> : <ul key={key}>{children}</ul>);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={key}>
        {paragraph.map((paragraphLine, lineIndex) => (
          <Fragment key={`${key}-line-${lineIndex}`}>
            {renderInline(paragraphLine, `${key}-line-${lineIndex}`, allowInteractiveElements)}
            {lineIndex < paragraph.length - 1 && <br />}
          </Fragment>
        ))}
      </p>,
    );
  }

  return blocks;
}

export function Markdown({ children, className = "", allowInteractiveElements = true }: MarkdownProps) {
  return <div className={`markdown-content ${className}`.trim()}>{renderBlocks(children, allowInteractiveElements)}</div>;
}
