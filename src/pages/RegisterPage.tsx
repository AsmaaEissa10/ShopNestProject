import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../lib/supabase';
import { RegisterFormValues, registerSchema } from '../lib/validation';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { classNames, passwordScore } from '../lib/utils';

const oauthProviders = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'apple', label: 'Continue with Apple' }
] as const;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOAuthLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState<0 | 1 | 2 | 3>(0);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors }
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      tos_accepted: false,
      marketing_opt_in: false
    }
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setToast(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signUp(
      {
        email: values.email,
        password: values.password
      },
      {
        emailRedirectTo: `${window.location.origin}/register/confirm`,
        data: {
          first_name: values.first_name,
          last_name: values.last_name,
          marketing_opt_in: values.marketing_opt_in,
          tos_version: '1.0',
          tos_accepted_at: new Date().toISOString()
        }
      }
    );

    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('duplicate')) {
        setError('email', { message: 'This email is already registered.' });
        return;
      }
      setToast(error.message || 'Unable to create your account. Please try again.');
      return;
    }

    navigate('/register/confirm', {
      state: { email: values.email }
    });
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setToast(null);
    setOAuthLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/register/confirm`
      }
    });
    setOAuthLoading(null);
    if (error) {
      setToast(error.message || `Unable to start ${provider} login.`);
    }
  };

  return (
    <main className="page-shell">
      <section className="card">
        <header className="card__header">
          <div>
            <p className="eyebrow">ShopNest</p>
            <h1>Create your account</h1>
            <p className="description">Register for saved addresses, order tracking, and personalized offers.</p>
          </div>
        </header>

        <div className="oauth-grid">
          {oauthProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={classNames('oauth-button', oauthLoading === provider.id && 'button--loading')}
              onClick={() => handleOAuth(provider.id)}
              disabled={loading || Boolean(oauthLoading)}
            >
              <span className="oauth-button__icon">{provider.id === 'google' ? 'G' : ''}</span>
              {provider.label}
            </button>
          ))}
        </div>

        <div className="divider" aria-hidden="true">
          <span>or continue with email</span>
        </div>

        {toast ? (
          <div className="toast" role="alert" aria-live="assertive">
            {toast}
          </div>
        ) : null}

        <form className="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field-row">
            <label className="field">
              <span className="field__label">First name</span>
              <input
                type="text"
                autoComplete="given-name"
                {...register('first_name')}
                aria-invalid={Boolean(errors.first_name)}
                className={classNames(errors.first_name && 'field--error')}
              />
              {errors.first_name ? <span className="field__error">{errors.first_name.message}</span> : null}
            </label>
            <label className="field">
              <span className="field__label">Last name</span>
              <input
                type="text"
                autoComplete="family-name"
                {...register('last_name')}
                aria-invalid={Boolean(errors.last_name)}
                className={classNames(errors.last_name && 'field--error')}
              />
              {errors.last_name ? <span className="field__error">{errors.last_name.message}</span> : null}
            </label>
          </div>

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
              autoComplete="new-password"
              {...register('password', {
                onChange: (event) => setPasswordStrength(passwordScore(event.target.value))
              })}
              aria-invalid={Boolean(errors.password)}
              className={classNames(errors.password && 'field--error')}
            />
            {errors.password ? <span className="field__error">{errors.password.message}</span> : null}
          </label>

          <PasswordStrengthMeter score={passwordStrength} />

          <div className="checkbox-group">
            <label className="checkbox-field">
              <input type="checkbox" {...register('tos_accepted')} />
              <span>
                I agree to the <a href="#" target="_blank" rel="noreferrer">Terms of Service</a> and{' '}
                <a href="#" target="_blank" rel="noreferrer">Privacy Policy</a>.
              </span>
            </label>
            {errors.tos_accepted ? <span className="field__error">{errors.tos_accepted.message}</span> : null}
          </div>

          <label className="checkbox-field checkbox-field--secondary">
            <input type="checkbox" {...register('marketing_opt_in')} />
            <span>Send me marketing emails and product updates.</span>
          </label>

          <button type="submit" className="submit-button" disabled={loading || Boolean(oauthLoading)}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="helper-text">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
