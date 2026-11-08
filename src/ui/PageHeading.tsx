import type { ReactNode } from 'react';

export function PageHeading({ title, children }: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading page-heading-row">
      <div className="page-heading-copy">
        <h1>{title}</h1>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
