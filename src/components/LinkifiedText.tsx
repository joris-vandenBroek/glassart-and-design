import { Fragment } from 'react';

const URL_SPLIT_PATTERN = /(https?:\/\/[^\s]+)/g;
const URL_MATCH_PATTERN = /^https?:\/\/[^\s]+$/;

function linkifyLine(line: string, lineKey: number) {
  const parts = line.split(URL_SPLIT_PATTERN);
  return parts.map((part, i) =>
    URL_MATCH_PATTERN.test(part) ? (
      <a
        key={`${lineKey}-${i}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-gold-bright"
      >
        {part}
      </a>
    ) : (
      <Fragment key={`${lineKey}-${i}`}>{part}</Fragment>
    )
  );
}

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  return (
    <p className={className}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {linkifyLine(line, i)}
        </Fragment>
      ))}
    </p>
  );
}
