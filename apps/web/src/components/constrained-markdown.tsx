import { createElement, Fragment, type ReactElement, type ReactNode } from "react";
import { parseConstrainedMarkdown, type MarkdownInline } from "@/lib/constrained-markdown";

function renderInline(nodes: MarkdownInline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text": return node.value;
      case "break": return createElement("br", { key: index });
      case "strong": return createElement("strong", { key: index }, renderInline(node.children));
      case "em": return createElement("em", { key: index }, renderInline(node.children));
      case "link": return createElement("a", { key: index, href: node.href, target: "_blank", rel: "noopener noreferrer nofollow" }, renderInline(node.children));
    }
  });
}

export function ConstrainedMarkdown({ source, baseLevel }: { source: string; baseLevel: 3 | 4 }): ReactElement {
  return createElement(Fragment, null, parseConstrainedMarkdown(source).map((block, index) => {
    switch (block.type) {
      case "heading": return createElement(`h${baseLevel + block.level - 1}`, { key: index }, renderInline(block.children));
      case "paragraph": return createElement("p", { key: index }, renderInline(block.children));
      case "list": {
        return createElement(block.ordered ? "ol" : "ul", { key: index },
          block.items.map((item, itemIndex) => createElement("li", { key: itemIndex }, renderInline(item))));
      }
    }
  }));
}
