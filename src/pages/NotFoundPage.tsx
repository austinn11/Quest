import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="not-found">
      <p className="not-found-code" aria-hidden="true">404</p>
      <header className="page-heading"><h1>Page not found</h1></header>
      <p>These lands are uncharted. The path you seek does not exist yet.</p>
      <Link className="button-link" to="/">Return home</Link>
    </section>
  );
}
