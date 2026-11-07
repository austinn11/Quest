import { Link } from 'react-router';

export function NotFoundPage() {
  return <><header className="page-heading"><h1>Page not found</h1><p>This path does not lead to an adventure yet.</p></header><Link to="/">Return home</Link></>;
}
