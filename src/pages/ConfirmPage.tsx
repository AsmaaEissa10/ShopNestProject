import { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';

export default function ConfirmPage() {
  const location = useLocation();
  const state = location.state as { email?: string } | null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="page-shell">
      <section className="card card--center">
        <div className="card__header">
          <p className="eyebrow">Registration complete</p>
          <h1>Check your inbox</h1>
          <p className="description">
            We sent a confirmation email to <strong>{state?.email ?? 'your address'}</strong>.
            Open the message and follow the link to verify your account.
          </p>
        </div>
        <div className="confirm-actions">
          <p>If you don't see it, check your spam folder or try again later.</p>
          <Link to="/login" className="submit-button submit-button--secondary">
            Go to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
