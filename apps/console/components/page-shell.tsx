import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Console</p>
          <h1>{title}</h1>
          <p className="muted">{description}</p>
        </div>
      </div>
      <div className="panel">{children}</div>
    </section>
  );
}
