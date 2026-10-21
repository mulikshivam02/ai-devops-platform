import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <main className="auth-loading">
      <div>
        <h1>Page not found</h1>
        <p>There is nothing at this address.</p>
        <Link className="button button--primary" to="/">Back to the dashboard</Link>
      </div>
    </main>
  );
}
