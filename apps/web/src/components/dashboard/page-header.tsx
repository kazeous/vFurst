import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="vf-page-header">
      <div className="vf-page-heading">
        {eyebrow ? <p className="vf-label">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="vf-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="vf-actions">{actions}</div> : null}
    </header>
  );
}
