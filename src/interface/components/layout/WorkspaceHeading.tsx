import Link from 'next/link';
import type { ReactNode } from 'react';

export type Crumb = { label: string; href?: string };

export function WorkspaceHeading({
  label,
  title,
  description,
  actions,
  crumbs,
}: {
  label: string;
  title: string;
  description: string;
  actions?: ReactNode;
  /** Where this page sits (Studio › Project), shown above the title. */
  crumbs?: Crumb[];
}) {
  return (
    <header className="workspace-heading">
      <div>
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb" className="workspace-crumbs">
            {crumbs.map((crumb) => (
              <span key={crumb.label}>
                {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
              </span>
            ))}
          </nav>
        ) : (
          <p className="sr-only">{label}</p>
        )}
        <h1>{title}</h1>
        <p className="workspace-description">{description}</p>
      </div>
      {actions && <div className="workspace-actions">{actions}</div>}
    </header>
  );
}
