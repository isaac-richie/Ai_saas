import type { ReactNode } from 'react';

export function WorkspaceHeading({
  label,
  title,
  description,
  actions,
}: {
  label: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-heading">
      <div>
        <p className="workspace-eyebrow">{label}</p>
        <h1>{title}</h1>
        <p className="workspace-description">{description}</p>
      </div>
      {actions && <div className="workspace-actions">{actions}</div>}
    </header>
  );
}
