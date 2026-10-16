import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail, UserPlus, UserRound } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { FormAlert } from '../components/ui/FormFeedback';
import TextField from '../components/ui/TextField';
import { ADMIN_EMAIL } from '../lib/academic';
import { validateRegisterFields, type RegisterErrors } from '../lib/validation';
import { useAppStore } from '../store/useAppStore';

export default function Register() {
  const register = useAppStore((s) => s.register);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The reserved administrator email is assigned the ADMIN role by the store.
  const isAdminEmail = email.trim().toLowerCase() === ADMIN_EMAIL;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNotice(null);

    const found = validateRegisterFields({ fullName, email, password, confirmPassword });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Please fix the highlighted fields and try again.');
      return;
    }

    setSubmitting(true);
    const result = await register({ fullName, email, password });
    if (!result.ok) {
      if (result.code === 'EMAIL_TAKEN') setErrors({ email: result.message });
      setFormError(result.message);
      setSubmitting(false);
      return;
    }
    if (result.data?.needsEmailConfirmation) {
      // Supabase "Confirm email" is ON: no session yet. Ask the user to confirm, then sign in.
      setNotice('Account created. Check your inbox and click the confirmation link, then sign in.');
      setSubmitting(false);
    }
    // Otherwise the router redirects: students continue to the profile form, admins to the dashboard.
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Register to select courses, view your schedule, and access your academic records."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormAlert message={formError} />
        <FormAlert variant="info" message={notice} />

        <TextField
          id="fullName"
          label="Full name"
          icon={UserRound}
          autoComplete="name"
          placeholder="e.g., John Doe"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
        />

        <div>
          <TextField
            id="email"
            type="email"
            label="Email address"
            icon={Mail}
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          {isAdminEmail && (
            <div className="mt-3">
              <FormAlert
                variant="info"
                message="This email is reserved for the portal administrator. You will be registered with Administrator access."
              />
            </div>
          )}
        </div>

        <TextField
          id="password"
          type={showPassword ? 'text' : 'password'}
          label="Password"
          icon={Lock}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
              className="rounded-md p-1.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <TextField
          id="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          label="Confirm password"
          icon={Lock}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
        />

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          {submitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    </AuthLayout>
  );
}
