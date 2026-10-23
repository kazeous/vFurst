export type MarkdownInline =
  | { type: "text"; value: string }
  | { type: "break" }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "em"; children: MarkdownInline[] }
  | { type: "link"; href: string; children: MarkdownInline[] };

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; children: MarkdownInline[] }
  | { type: "paragraph"; children: MarkdownInline[] }
  | { type: "list"; ordered: boolean; items: MarkdownInline[][] };

const ESCAPABLE = new Set(["*", "_", "[", "]", "#", "\\"]);
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", ")"]);

function allowedUrl(value: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Index balanced destinations once, so unmatched brackets cannot cause repeated
// scans of the rest of a pasted document. Escaped brackets are always literal.
function closingPairs(source: string): Map<number, number> {
  const pairs = new Map<number, number>();
  const brackets: number[] = [];
  const parentheses: number[] = [];
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === "\\" && ESCAPABLE.has(source[index + 1] ?? "")) {
      index++;
    } else if (char === "[") {
      brackets.push(index);
    } else if (char === "(") {
      parentheses.push(index);
    } else if (char === "]" || char === ")") {
      const start = (char === "]" ? brackets : parentheses).pop();
      if (start !== undefined) pairs.set(start, index);
    }
  }
  return pairs;
}

function followingEmphasisCloser(source: string, pairs: Map<number, number>): (marker: string, start: number) => number | undefined {
  const positions: number[] = [];
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === "\\" && ESCAPABLE.has(source[index + 1] ?? "")) {
      index++;
      continue;
    }
    // Labeled links are atoms in their enclosing inline span: their contents
    // cannot close an emphasis frame outside the link, even if rejected.
    if (char === "[") {
      const labelEnd = pairs.get(index);
      if (labelEnd !== undefined && source[labelEnd + 1] === "(") {
        index = pairs.get(labelEnd + 1) ?? source.length;
        continue;
      }
    }
    if (char === "_" || char === "*") positions.push(index);
  }
  const markers = ["*", "_", "**"];
  const closing = new Map(markers.map((marker) => [marker, new Int32Array(positions.length + 1).fill(-1)]));
  const emptyClosing = new Map(markers.map((marker) => [marker, new Int32Array(positions.length + 1).fill(-1)]));
  // Summarize the scanner's delimiter rules backwards. Each entry identifies
  // this frame's closer after skipping complete child spans, rather than
  // borrowing a child's closer. Empty frames cannot close immediately.
  for (let index = positions.length - 1; index >= 0; index--) {
    const position = positions[index]!;
    for (const frameMarker of markers) {
      const char = source[position]!;
      const marker = char === "*" && frameMarker !== "*" && source[position + 1] === "*" ? "**" : char;
      let continuation = -1;
      if (position + marker.length < source.length && !/\s/.test(source[position + marker.length]!)) {
        let afterOpen = index + 1;
        if (positions[afterOpen] === position + 1 && marker.length === 2) afterOpen++;
        const childClosing = positions[afterOpen] === position + marker.length ? emptyClosing : closing;
        const childEnd = childClosing.get(marker)![afterOpen]!;
        if (childEnd >= 0) {
          let afterClose = childEnd + 1;
          if (positions[afterClose] === positions[childEnd]! + 1 && marker.length === 2) afterClose++;
          continuation = closing.get(frameMarker)![afterClose]!;
        }
      } else continuation = closing.get(frameMarker)![index + 1]!;
      emptyClosing.get(frameMarker)![index] = continuation;
      closing.get(frameMarker)![index] = marker === frameMarker && position > 0 && !/\s/.test(source[position - 1]!)
        ? index : continuation;
    }
  }
  let cursor = 0;
  return (marker, start) => {
    // Only the outer scan parses URLs, and it always moves forward.
    while (cursor < positions.length && positions[cursor]! < start) cursor++;
    const closer = closing.get(marker)?.[cursor];
    return closer !== undefined && closer >= 0 ? positions[closer] : undefined;
  };
}

type InlineFrame = {
  marker: string;
  start: number;
  literal: boolean;
  children: MarkdownInline[];
  text: string[];
};

function flushText(frame: InlineFrame): void {
  if (frame.text.length === 0) return;
  const value = frame.text.join("");
  const previous = frame.children.at(-1);
  if (previous?.type === "text") previous.value += value;
  else frame.children.push({ type: "text", value });
  frame.text = [];
}

function appendLiteral(frame: InlineFrame, value: string): void {
  const lines = value.split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (index > 0) {
      flushText(frame);
      frame.children.push({ type: "break" });
    }
    frame.text.push(lines[index]!);
  }
}

function emphasisClosePosition(source: string, start: number, end: number, frames: InlineFrame[]): number | undefined {
  let closers = "";
  const boundaries = new Set<number>([0]);
  for (let index = frames.length - 1; index > 0; index--) {
    const marker = frames[index]!.marker;
    if (closers.length + marker.length > end - start) break;
    closers += marker;
    boundaries.add(closers.length);
  }
  if (!closers) return undefined;
  // Prefix matching finds the longest complete sequence of enclosing closers
  // in a URL token. Keep the last complete match so internal URL markers stay
  // intact and closing markers can be followed immediately by ordinary text.
  const prefixes = new Array<number>(closers.length).fill(0);
  for (let index = 1, matched = 0; index < closers.length; index++) {
    while (matched > 0 && closers[index] !== closers[matched]) matched = prefixes[matched - 1]!;
    if (closers[index] === closers[matched]) matched++;
    prefixes[index] = matched;
  }
  let matched = 0;
  let closePosition: number | undefined;
  for (let index = start; index < end; index++) {
    while (matched > 0 && source[index] !== closers[matched]) matched = prefixes[matched - 1]!;
    if (source[index] === closers[matched]) matched++;
    if (matched > 0 && boundaries.has(matched)) closePosition = index + 1 - matched;
  }
  return closePosition;
}

function parseInline(source: string): MarkdownInline[] {
  const pairs = closingPairs(source);
  const nextEmphasisCloser = followingEmphasisCloser(source, pairs);
  const bareUrl = /https?:\/\/[^\s<>]+/iy;

  function scan(start: number, end: number, depth: number, links: boolean): MarkdownInline[] {
    const root: InlineFrame = { marker: "", start, literal: false, children: [], text: [] };
    const frames = [root];
    let index = start;
    while (index < end) {
      const frame = frames[frames.length - 1]!;
      const char = source[index]!;
      if (char === "\\" && index + 1 < end && ESCAPABLE.has(source[index + 1]!)) {
        frame.text.push(source[index + 1]!);
        index += 2;
        continue;
      }
      if (char === "\n") {
        flushText(frame);
        frame.children.push({ type: "break" });
        index++;
        continue;
      }
      if (links && char === "[") {
        const labelEnd = pairs.get(index);
        const urlEnd = labelEnd === undefined ? undefined : pairs.get(labelEnd + 1);
        if (labelEnd !== undefined && source[labelEnd + 1] === "(" && (urlEnd === undefined || urlEnd >= end)) {
          appendLiteral(frame, source.slice(index, end));
          break;
        }
        if (labelEnd !== undefined && source[labelEnd + 1] === "(" && urlEnd !== undefined && urlEnd < end) {
          const href = source.slice(labelEnd + 2, urlEnd);
          if (allowedUrl(href)) {
            flushText(frame);
            frame.children.push({ type: "link", href, children: scan(index + 1, labelEnd, depth + frames.length - 1, false) });
          } else {
            appendLiteral(frame, source.slice(index, urlEnd + 1));
          }
          index = urlEnd + 1;
          continue;
        }
      }
      if (links && (char === "h" || char === "H")) {
        bareUrl.lastIndex = index;
        const match = bareUrl.exec(source);
        if (match) {
          let urlEnd = Math.min(index + match[0].length, end);
          const laterCloser = nextEmphasisCloser(frame.marker, urlEnd);
          const closesAfterUrl = laterCloser !== undefined && laterCloser < end;
          while (urlEnd > index && TRAILING_PUNCTUATION.has(source[urlEnd - 1]!)) urlEnd--;
          // A complete URL wins over internal marker characters when this
          // emphasis can close after the token. Otherwise resolve its closer
          // within the token, including a closer followed by adjacent text.
          if (!closesAfterUrl) urlEnd = emphasisClosePosition(source, index, urlEnd, frames) ?? urlEnd;
          while (urlEnd > index && TRAILING_PUNCTUATION.has(source[urlEnd - 1]!)) urlEnd--;
          const href = source.slice(index, urlEnd);
          if (allowedUrl(href)) {
            flushText(frame);
            frame.children.push({ type: "link", href, children: [{ type: "text", value: href }] });
          } else frame.text.push(href);
          index = urlEnd;
          continue;
        }
      }
      if (char === "*" || char === "_") {
        // On closing ***, close an inner * before the surrounding **.
        const marker = char === "*" && frame.marker !== "*" && source[index + 1] === "*" && index + 1 < end ? "**" : char;
        if (frame.marker === marker && index > frame.start + marker.length && !/\s/.test(source[index - 1]!)) {
          frames.pop();
          const parent = frames[frames.length - 1]!;
          if (frame.literal) appendLiteral(parent, source.slice(frame.start, index + marker.length));
          else {
            flushText(frame);
            flushText(parent);
            parent.children.push({ type: marker === "**" ? "strong" : "em", children: frame.children });
          }
          index += marker.length;
          continue;
        }
        if (index + marker.length < end && !/\s/.test(source[index + marker.length]!)) {
          flushText(frame);
          frames.push({ marker, start: index, literal: depth + frames.length > 3, children: [], text: [] });
          index += marker.length;
          continue;
        }
      }
      frame.text.push(char);
      index++;
    }
    // An unfinished outer marker preserves its complete original span, without
    // reparsing the suffix once for every unmatched inner marker.
    if (frames.length > 1) appendLiteral(root, source.slice(frames[1]!.start, end));
    flushText(root);
    return root.children;
  }

  return scan(0, source.length, 0, true);
}

export function parseConstrainedMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: Extract<MarkdownBlock, { type: "list" }> | undefined;
  function flushParagraph(): void {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
    paragraph = [];
  }
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") {
      flushParagraph();
      list = undefined;
      continue;
    }
    const heading = /^(#{1,3})[ \t]+(.*)$/.exec(line);
    const item = /^(?:([-*•])|\d+\.)[ \t]+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      list = undefined;
      blocks.push({ type: "heading", level: heading[1]!.length as 1 | 2 | 3, children: parseInline(heading[2]!) });
    } else if (item) {
      flushParagraph();
      const ordered = item[1] === undefined;
      if (!list || list.ordered !== ordered) {
        list = { type: "list", ordered, items: [] };
        blocks.push(list);
      }
      list.items.push(parseInline(item[2]!));
    } else {
      list = undefined;
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}
