/**
 * Renders chat / follow-up text with scan-friendly structure:
 * blank lines → spacers, "- item" / "1. item" → list rows, else paragraphs.
 */
export function FormattedAnswer({ text }: { text: string }) {
  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return <p className="text-slate-300">No answer returned.</p>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const isList = lines.every(
          (line) => /^[-•]/.test(line) || /^\d+\./.test(line),
        );

        if (isList) {
          return (
            <ul key={blockIndex} className="space-y-1.5 pl-0">
              {lines.map((line, lineIndex) => {
                const content = line.replace(/^([-•]|\d+\.)\s*/, "");
                return (
                  <li
                    key={`${blockIndex}-${lineIndex}`}
                    className="flex gap-2 text-slate-300"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    <span>{content}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        // First non-list block often works as a short lead line.
        if (blockIndex === 0 && lines.length === 1) {
          return (
            <p key={blockIndex} className="font-medium text-slate-100">
              {lines[0]}
            </p>
          );
        }

        return (
          <div key={blockIndex} className="space-y-1.5">
            {lines.map((line, lineIndex) => {
              if (/^[-•]/.test(line) || /^\d+\./.test(line)) {
                return (
                  <p
                    key={`${blockIndex}-${lineIndex}`}
                    className="flex gap-2 pl-1 text-slate-300"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    <span>{line.replace(/^([-•]|\d+\.)\s*/, "")}</span>
                  </p>
                );
              }
              return (
                <p key={`${blockIndex}-${lineIndex}`} className="text-slate-300">
                  {line}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
