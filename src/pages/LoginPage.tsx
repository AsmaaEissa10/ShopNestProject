import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../lib/supabase';
import { loginSchema, LoginFormValues } from '../lib/validation';
import { classNames } from '../lib/utils';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  });

  const onSubmit = async (values: LoginFormValues) => {
    setErrorMessage(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password
    });
    setLoading(false);
    if (error) {
      setErrorMessage(error.message || 'Unable to sign in. Please check your credentials.');
      return;
    }
    navigate('/register/confirm');
  };

  return (
    <main className="page-shell">
      <section className="card">
        <header className="card__header">
          <p className="eyebrow">Welcome back</p>
          <h1>Sign in to ShopNest</h1>
          <p className="description">Use your registered email and password to continue.</p>
        </header>

        {errorMessage ? (
          <div className="toast" role="alert" aria-live="assertive">
            {errorMessage}
          </div>
        ) : null}

        <form className="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              autoComplete="email"
              {...register('email')}
              aria-invalid={Boolean(errors.email)}
              className={classNames(errors.email && 'field--error')}
            />
            {errors.email ? <span className="field__error">{errors.email.message}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              {...register('password')}
              aria-invalid={Boolean(errors.password)}
              className={classNames(errors.password && 'field--error')}
            />
            {errors.password ? <span className="field__error">{errors.password.message}</span> : null}
          </label>

          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="helper-text">
          New to ShopNest? <Link to="/register">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
