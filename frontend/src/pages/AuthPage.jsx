import { useState } from 'react';
import { ArrowRight, BookOpenText, LockKeyhole, Mail, UserRound } from 'lucide-react';
import Brand from '../components/Brand';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { authenticate, startupError } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authenticate(mode, mode === 'register'
        ? { name: name.trim(), email: email.trim(), password }
        : { email: email.trim(), password });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <div className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> YOUR RESEARCH COMPANION</div>
          <h1>Go deeper into<br /><em>every discovery.</em></h1>
          <p>Bring your papers together, uncover the important ideas, and ask better questions with a workspace built for curious minds.</p>
          <div className="auth-story-card">
            <span className="story-card-icon"><BookOpenText size={23} /></span>
            <div><strong>From paper to perspective</strong><span>Organize, understand, and explore your research in one place.</span></div>
          </div>
        </div>
        <div className="auth-story-foot">RESEARCHMIND · A SMARTER WAY TO READ</div>
      </div>

      <div className="auth-form-side">
        <div className="auth-mobile-brand"><Brand compact /></div>
        <div className="auth-form-wrap">
          <div className="auth-icon"><BookOpenText size={25} /></div>
          <div className="eyebrow">WELCOME TO RESEARCHMIND</div>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="auth-subtitle">{mode === 'login' ? 'Sign in to continue your research journey.' : 'Start building your personal research library.'}</p>

          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && (
              <label className="field-label">Full name
                <span className="input-wrap"><UserRound size={18} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" required /></span>
              </label>
            )}
            <label className="field-label">Email address
              <span className="input-wrap"><Mail size={18} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></span>
            </label>
            <label className="field-label">Password
              <span className="input-wrap"><LockKeyhole size={18} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required /></span>
            </label>
            {mode === 'register' && <p className="field-hint">Use at least 8 characters.</p>}
            {(error || startupError) && <p className="form-error" role="alert">{error || startupError}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={18} /></button>
          </form>

          <p className="auth-switch">{mode === 'login' ? 'New to ResearchMind?' : 'Already have an account?'}{' '}
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button>
          </p>
        </div>
        <div className="auth-form-foot">Your research, organized around you.</div>
      </div>
    </div>
  );
}
