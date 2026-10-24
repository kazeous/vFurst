import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConstrainedMarkdown } from "@/components/constrained-markdown";
import { parseConstrainedMarkdown, type MarkdownInline } from "./constrained-markdown";

const text = (value: string): MarkdownInline => ({ type: "text", value });
const paragraph = (children: MarkdownInline[]) => ({ type: "paragraph", children });

describe("constrained Markdown", () => {
  it("parses each construct", () => {
    expect(parseConstrainedMarkdown("# One\n\n## Two\n\n### Three\n\nFirst\nsecond\n\n- Dash\n* Star\n\n1. First\n2. Second")).toEqual([
      { type: "heading", level: 1, children: [text("One")] },
      { type: "heading", level: 2, children: [text("Two")] },
      { type: "heading", level: 3, children: [text("Three")] },
      paragraph([text("First"), { type: "break" }, text("second")]),
      { type: "list", ordered: false, items: [[text("Dash")], [text("Star")]] },
      { type: "list", ordered: true, items: [[text("First")], [text("Second")]] }
    ]);
    expect(parseConstrainedMarkdown("**bold** *italic* _also italic_ [site](https://example.com) [mail](mailto:hi@example.com) http://example.com")).toEqual([
      paragraph([
        { type: "strong", children: [text("bold")] }, text(" "),
        { type: "em", children: [text("italic")] }, text(" "),
        { type: "em", children: [text("also italic")] }, text(" "),
        { type: "link", href: "https://example.com", children: [text("site")] }, text(" "),
        { type: "link", href: "mailto:hi@example.com", children: [text("mail")] }, text(" "),
        { type: "link", href: "http://example.com", children: [text("http://example.com")] }
      ])
    ]);
    expect(parseConstrainedMarkdown(String.raw`\* \_ \[ \] \# \\`)).toEqual([
      paragraph([text("* _ [ ] # \\")])
    ]);
  });

  it.each([
    "[x](javascript:alert(1))", "[x](data:text/html,1)", "[x](vbscript:msgbox(1))",
    "[x](/relative)", "[x](//example.com)", "[x](https://)",
    "<script>alert(1)</script>", "<img src=x onerror=1>"
  ])("keeps hostile or unsupported input as text: %s", (source) => {
    expect(parseConstrainedMarkdown(source)).toEqual([paragraph([text(source)])]);
  });

  it("does not include trailing punctuation in bare links", () => {
    for (const suffix of [".", ",", ";", ":", "!", "?", ")", ".,;:!?)"]) {
      expect(parseConstrainedMarkdown(`See https://example.com/a${suffix}`)).toEqual([
        paragraph([text("See "), { type: "link", href: "https://example.com/a", children: [text("https://example.com/a")] }, text(suffix)])
      ]);
    }
  });

  it("treats unclosed and over-nested markers as text", () => {
    for (const source of ["**unclosed", "*unclosed", "_unclosed", "[label](https://example.com", "[label", "**outer *unclosed"]) {
      expect(parseConstrainedMarkdown(source)).toEqual([paragraph([text(source)])]);
    }
    expect(parseConstrainedMarkdown("**one *two _three **four** three_ two* one**")).toEqual([
      paragraph([{ type: "strong", children: [text("one "), { type: "em", children: [text("two "), {
        type: "em", children: [text("three **four** three")]
      }, text(" two")] }, text(" one")] }])
    ]);
    expect(parseConstrainedMarkdown("***nested***")).toEqual([
      paragraph([{ type: "strong", children: [{ type: "em", children: [text("nested")] }] }])
    ]);
  });

  it.each([
    ["**first\nsecond", "**first", "second"],
    ["[label](https://example.com\nunfinished", "[label](https://example.com", "unfinished"],
    ["[first\nsecond](javascript:alert(1))", "[first", "second](javascript:alert(1))"],
    ["[label](data:text/html,first\nsecond)", "[label](data:text/html,first", "second)"]
  ])("preserves paragraph breaks in literal fallback: %s", (source, first, second) => {
    expect(parseConstrainedMarkdown(source)).toEqual([paragraph([text(first), { type: "break" }, text(second)])]);
    expect(renderToStaticMarkup(createElement(ConstrainedMarkdown, { source, baseLevel: 4 })))
      .toBe(`<p>${first}<br/>${second}</p>`);
  });

  it("preserves paragraph breaks in depth-four literal emphasis", () => {
    expect(parseConstrainedMarkdown("**one *two _three **first\nsecond** three_ two* one**")).toEqual([
      paragraph([{ type: "strong", children: [text("one "), { type: "em", children: [text("two "), {
        type: "em", children: [text("three **first"), { type: "break" }, text("second** three")]
      }, text(" two")] }, text(" one")] }])
    ]);
  });

  it("handles pasted documents", () => {
    const parsed = parseConstrainedMarkdown("“Policy”\u00a0text\r\nsecond line\r\n\r\n• First\r\n• ‘Second’\r\n\r\nLast");
    expect(parsed).toEqual([
      paragraph([text("“Policy”\u00a0text"), { type: "break" }, text("second line")]),
      { type: "list", ordered: false, items: [[text("First")], [text("‘Second’")]] },
      paragraph([text("Last")])
    ]);
    expect(JSON.stringify(parsed)).not.toContain("\\r");
  });

  it("keeps unsupported block syntax literal and separates adjacent block kinds", () => {
    expect(parseConstrainedMarkdown("#### Four\nplain\n# Heading\n- List\n1. Ordered\nend")).toEqual([
      paragraph([text("#### Four"), { type: "break" }, text("plain")]),
      { type: "heading", level: 1, children: [text("Heading")] },
      { type: "list", ordered: false, items: [[text("List")]] },
      { type: "list", ordered: true, items: [[text("Ordered")]] },
      paragraph([text("end")])
    ]);
    expect(parseConstrainedMarkdown(" \n\n")).toEqual([]);
  });

  it("supports formatted link labels, balanced destinations, and escaped markers", () => {
    expect(parseConstrainedMarkdown(String.raw`[**site**](https://example.com/a(b)) \*literal\* \[x\](https://example.com)`)).toEqual([
      paragraph([
        { type: "link", href: "https://example.com/a(b)", children: [{ type: "strong", children: [text("site")] }] },
        text(" *literal* [x]("),
        { type: "link", href: "https://example.com", children: [text("https://example.com")] }, text(")")
      ])
    ]);
  });

  it("allows bare links inside emphasis without consuming the closing marker", () => {
    for (const marker of ["**", "*", "_"]) {
      expect(parseConstrainedMarkdown(`${marker}https://example.com/a.${marker}`)).toEqual([
        paragraph([{ type: marker === "**" ? "strong" : "em", children: [
          { type: "link", href: "https://example.com/a", children: [text("https://example.com/a")] }, text(".")
        ] }])
      ]);
    }
  });

  it.each([
    ["_", "https://example.com/my_policy"],
    ["*", "https://example.com/a*b"],
    ["**", "https://example.com/a**b"]
  ])("retains internal URL emphasis characters inside %s", (marker, href) => {
    for (const punctuation of ["", ".", ",;:!?)"]) {
      expect(parseConstrainedMarkdown(`${marker}${href}${punctuation}${marker}.`)).toEqual([
        paragraph([{ type: marker === "**" ? "strong" : "em", children: [
          { type: "link", href, children: [text(href)] }, ...(punctuation ? [text(punctuation)] : [])
        ] }, text(".")])
      ]);
    }
    expect(parseConstrainedMarkdown(`***${href}***`)).toEqual([
      paragraph([{ type: "strong", children: [{ type: "em", children: [
        { type: "link", href, children: [text(href)] }
      ] }] }])
    ]);
    expect(parseConstrainedMarkdown(`**before _${href}_ after**`)).toEqual([
      paragraph([{ type: "strong", children: [text("before "), { type: "em", children: [
        { type: "link", href, children: [text(href)] }
      ] }, text(" after")] }])
    ]);
  });

  it.each([
    ["*", "https://example.com/a*b"],
    ["_", "https://example.com/my_policy"],
    ["**", "https://example.com/a**b"]
  ])("recognizes %s URL emphasis closers immediately before ordinary text", (marker, internalHref) => {
    for (const href of ["https://example.com/a", internalHref]) {
      for (const tail of ["text", ".Next"]) {
        for (const punctuation of ["", "."]) {
          expect(parseConstrainedMarkdown(`${marker}${href}${punctuation}${marker}${tail}`)).toEqual([
            paragraph([{ type: marker === "**" ? "strong" : "em", children: [
              { type: "link", href, children: [text(href)] }, ...(punctuation ? [text(punctuation)] : [])
            ] }, text(tail)])
          ]);
        }
      }
    }
    expect(parseConstrainedMarkdown("***https://example.com/a***text")).toEqual([
      paragraph([{ type: "strong", children: [{ type: "em", children: [
        { type: "link", href: "https://example.com/a", children: [text("https://example.com/a")] }
      ] }] }, text("text")])
    ]);
  });

  it.each([
    ["_", "https://example.com/my_policy"],
    ["*", "https://example.com/a*b"],
    ["**", "https://example.com/a**b"]
  ])("retains internal URL markers when %s emphasis closes after whitespace", (marker, href) => {
    for (const separator of [" ", "\n"]) {
      expect(parseConstrainedMarkdown(`${marker}${href}${separator}more${marker}`)).toEqual([
        paragraph([{ type: marker === "**" ? "strong" : "em", children: [
          { type: "link", href, children: [text(href)] },
          ...(separator === "\n" ? [{ type: "break" as const }, text("more")] : [text(" more")])
        ] }])
      ]);
    }
  });

  it.each([
    ["_", "https://example.com/my_policy"],
    ["*", "https://example.com/a*b"],
    ["**", "https://example.com/a**b"]
  ])("retains internal URL markers before a nested %s span and the outer closer", (marker, href) => {
    const type = marker === "**" ? "strong" : "em";
    expect(parseConstrainedMarkdown(`${marker}${href} ${marker}inner${marker} outer${marker}`)).toEqual([
      paragraph([{ type, children: [
        { type: "link", href, children: [text(href)] }, text(" "),
        { type, children: [text("inner")] }, text(" outer")
      ] }])
    ]);
    const secondHref = "https://example.com/second";
    expect(parseConstrainedMarkdown(`${marker}${href} and ${secondHref}${marker}`)).toEqual([
      paragraph([{ type, children: [
        { type: "link", href, children: [text(href)] }, text(" and "),
        { type: "link", href: secondHref, children: [text(secondHref)] }
      ] }])
    ]);
  });

  it.each([
    ["*", "https://example.com/a*b"],
    ["_", "https://example.com/my_policy"],
    ["**", "https://example.com/a**b"]
  ])("keeps %s URL emphasis separate from a later independent span", (marker, internalHref) => {
    const type = marker === "**" ? "strong" : "em";
    for (const href of ["https://example.com/a", internalHref]) {
      for (const tail of ["", "text", ".Next"]) {
        for (const separator of [" and ", "\n"]) {
          expect(parseConstrainedMarkdown(`${marker}${href}${marker}${tail}${separator}${marker}more${marker}`)).toEqual([
            paragraph([
              { type, children: [{ type: "link", href, children: [text(href)] }] },
              ...(separator === "\n"
                ? [...(tail ? [text(tail)] : []), { type: "break" as const }]
                : [text(`${tail}${separator}`)]),
              { type, children: [text("more")] }
            ])
          ]);
        }
      }
    }
  });

  it("keeps nested URL emphasis separate from a later independent span", () => {
    const href = "https://example.com/a";
    expect(parseConstrainedMarkdown(`***${href}*** and ***more***`)).toEqual([
      paragraph([
        { type: "strong", children: [{ type: "em", children: [{ type: "link", href, children: [text(href)] }] }] },
        text(" and "),
        { type: "strong", children: [{ type: "em", children: [text("more")] }] }
      ])
    ]);
    expect(parseConstrainedMarkdown(`**before _${href}_ and _more_ after**`)).toEqual([
      paragraph([{ type: "strong", children: [
        text("before "), { type: "em", children: [{ type: "link", href, children: [text(href)] }] },
        text(" and "), { type: "em", children: [text("more")] }, text(" after")
      ] }])
    ]);
  });

  it("renders semantic elements, bounded heading levels and escaped hostile text", () => {
    const source = '# One\n## Two\n### Three\n\n**bold** *italic*\n[site](https://example.com)\n\n- Item\n\n1. Item\n\n<script>alert(1)</script> [x](javascript:alert(1))';
    const html = renderToStaticMarkup(createElement(ConstrainedMarkdown, { source, baseLevel: 4 }));
    expect(html).toContain("<h4>One</h4><h5>Two</h5><h6>Three</h6>");
    expect(html).toContain('<p><strong>bold</strong> <em>italic</em><br/><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">site</a></p>');
    expect(html).toContain("<ul><li>Item</li></ul><ol><li>Item</li></ol>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; [x](javascript:alert(1))");
    expect(renderToStaticMarkup(createElement(ConstrainedMarkdown, { source: "# A\n## B\n### C", baseLevel: 3 })))
      .toContain("<h3>A</h3><h4>B</h4><h5>C</h5>");
  });

  it("parses a 100,000-character body within 200 ms", () => {
    for (const unit of ["Policy text with **strong** and [site](https://example.com).\n", "[", "*a ", "[x](", "https://", "[x](data:text/html,a\nb) ", "_https://example.com/my_policy._ ", "*https://example.com/a* and *more* "]) {
      const source = unit.repeat(Math.ceil(100_000 / unit.length)).slice(0, 100_000);
      const start = performance.now();
      expect(parseConstrainedMarkdown(source).length).toBeGreaterThan(0);
      expect(performance.now() - start).toBeLessThan(200);
    }
  });
});
