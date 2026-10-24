"use client";

import { ConstrainedMarkdown } from "@/components/constrained-markdown";
import { useState } from "react";

export function PolicyEditorFields({ title = "", body = "" }: { title?: string; body?: string }) {
  const [text, setText] = useState(body);

  return (
    <>
      <label>
        Title
        <input name="title" defaultValue={title} maxLength={120} required />
      </label>
      <label>
        Text
        <textarea name="body" value={text} onChange={(event) => setText(event.target.value)} rows={18} maxLength={100_000} required aria-describedby="policy-formatting" />
        <small id="policy-formatting" className="vf-muted">Formatting: # Heading, **bold**, *italic*, - list, 1. list, [link](https://…)</small>
      </label>
      <section aria-labelledby="policy-preview">
        <h2 id="policy-preview">Preview</h2>
        <ConstrainedMarkdown source={text} baseLevel={3} />
      </section>
    </>
  );
}
