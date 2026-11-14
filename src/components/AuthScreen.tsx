import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ShieldCheck, ArrowRight, RotateCcw } from 'lucide-react';
import {
  BOSS_ADMIN_PIN,
  DEMO_OTP_CODE,
  isBossAdminLogin,
  validateLoginCredentials,
  verifyOtpCode,
} from '../utils/auraLogic';
import type { AuthUser } from '../types/aura';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser, openAdminImmediately: boolean) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingAdmin, setPendingAdmin] = useState(false);

  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendSeconds, setResendSeconds] = useState(30);
  const [otpNotice, setOtpNotice] = useState('');
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [googleChooserOpen, setGoogleChooserOpen] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');

  useEffect(() => {
    if (step !== 'otp' || resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendSeconds]);

  const handleCredentialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const validation = validateLoginCredentials(identifier, password);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Please check your credentials.');
      return;
    }

    const adminMatch = isBossAdminLogin(identifier, password);
    if (password.trim() === BOSS_ADMIN_PIN) {
      onAuthenticated(
        {
          identifier: identifier.trim() || 'boss@aura.ai',
          role: 'admin',
          loggedInAt: Date.now(),
        },
        true
      );
      return;
    }

    setPendingAdmin(adminMatch);
    setOtpDigits(['', '', '', '', '', '']);
    setResendSeconds(30);
    setOtpNotice('');
    setStep('otp');
    window.setTimeout(() => {
      otpRefs.current[0]?.focus();
    }, 50);
  };

  const handleGuestLogin = () => {
    onAuthenticated(
      {
        identifier: 'guest@aura.ai',
        role: 'guest',
        loggedInAt: Date.now(),
      },
      false
    );
  };

  const openGoogleChooser = () => {
    setGoogleChooserOpen(true);
  };

  const completeGoogleSignIn = (emailInput?: string) => {
    const email = (emailInput || googleEmail || 'user@gmail.com').trim();
    const displayName = email.split('@')[0];
    const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

    localStorage.setItem('aura_user', JSON.stringify(email));
    localStorage.setItem('aura_name', capitalizedName);

    try {
      const raw = localStorage.getItem('aura_telemetry');
      const tel = raw
        ? JSON.parse(raw)
        : {
            totalRegisteredUsers: 0,
            activeSessionsCount: 0,
            totalQueriesProcessed: 0,
            totalImagesCreated: 0,
            activityLogs: [],
          };
      tel.totalRegisteredUsers = (tel.totalRegisteredUsers || 0) + 1;
      tel.activeSessionsCount = 1;
      tel.activityLogs = [
        {
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          text: `Google Sign-In: ${capitalizedName} (${email})`,
        },
        ...(tel.activityLogs || []),
      ];
      localStorage.setItem('aura_telemetry', JSON.stringify(tel));
    } catch {
      // ignore
    }

    setGoogleChooserOpen(false);
    onAuthenticated(
      {
        identifier: email,
        role: email.toLowerCase() === 'boss@aura.ai' ? 'admin' : 'user',
        loggedInAt: Date.now(),
      },
      false
    );
  };

  const handleOtpChange = (index: number, rawValue: string) => {
    const clean = rawValue.replace(/\D/g, '');
    setErrorMsg('');

    if (clean.length > 1) {
      const next = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        next[i] = clean[i] || '';
      }
      setOtpDigits(next);
      const focusIdx = Math.min(clean.length, 5);
      otpRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = clean;
    setOtpDigits(next);

    if (clean && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleResendOtp = () => {
    if (resendSeconds > 0) return;
    setResendSeconds(30);
    setErrorMsg('');
    setOtpNotice(`A fresh verification code (${DEMO_OTP_CODE}) has been dispatched.`);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const code = otpDigits.join('');
    if (!verifyOtpCode(code, DEMO_OTP_CODE)) {
      setErrorMsg(`Incorrect 6-digit OTP. Enter ${DEMO_OTP_CODE} to verify.`);
      return;
    }

    onAuthenticated(
      {
        identifier: identifier.trim() || 'user@aura.ai',
        role: pendingAdmin ? 'admin' : 'user',
        loggedInAt: Date.now(),
      },
      pendingAdmin
    );
  };

  return (
    <div
      data-testid="auth-screen"
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#07090E] bg-[radial-gradient(circle_at_20%_20%,#111936_0%,#07090E_70%)] p-4"
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#0F1420]/85 p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 text-center">
          <h1 className="font-display bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] bg-clip-text text-3xl font-bold tracking-[0.22em] text-transparent">
            AURA
          </h1>
          <p className="mt-1.5 text-xs text-[#94A3B8]">
            Personal Intelligence &amp; Live Neural Workspace
          </p>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentialSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="login-identifier" className="mb-1.5 block text-xs font-medium text-[#94A3B8]">
                Email or Mobile Number
              </label>
              <input
                id="login-identifier"
                type="text"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="name@domain.com or +91 9876543210"
                className="w-full rounded-xl border border-white/10 bg-[#07090E]/90 px-3.5 py-2.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#00F0FF]"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-[#94A3B8]">
                Password or Admin PIN
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-[#07090E]/90 py-2.5 pr-11 pl-3.5 text-sm text-[#F1F5F9] placeholder-[#64748B] outline-none transition-colors focus:border-[#00F0FF]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-1 flex w-9 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] px-4 py-2.5 text-sm font-semibold text-[#05070B] transition-opacity hover:opacity-95"
            >
              <span>Verify &amp; Send OTP</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            {/* OR divider and Continue with Google button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0', color: '#94a3b8', fontSize: '11px' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
              <span>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
            </div>

            <button
              type="button"
              onClick={openGoogleChooser}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.16)',
                background: '#ffffff',
                color: '#0f172a',
                fontWeight: 600,
                fontSize: '13.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: '0.2s',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={handleGuestLogin}
              className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm font-medium text-[#CBD5E1] transition-colors hover:border-white/20 hover:bg-white/5"
            >
              Continue as Guest
            </button>

            <p className="pt-1 text-center text-[11px] text-[#64748B]">
              Admin access: <span className="font-mono text-[#94A3B8]">boss@aura.ai</span> or PIN{' '}
              <span className="font-mono text-[#94A3B8]">2026</span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} noValidate className="space-y-4">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-[#00F0FF]/30 bg-[#00F0FF]/10 text-[#00F0FF]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-[#F1F5F9]">Two-Step Verification</p>
              <p className="mt-1 text-xs text-[#94A3B8]">
                Enter the 6-digit code sent to your device
              </p>
              <p className="font-mono mt-1.5 text-xs text-emerald-400">
                Demo OTP Code: {DEMO_OTP_CODE}
              </p>
            </div>

            <div className="flex justify-between gap-2" aria-label="6-digit verification code">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    otpRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  aria-label={`OTP digit ${idx + 1}`}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  className="font-mono h-12 w-11 rounded-xl border border-white/15 bg-[#07090E] text-center text-lg font-semibold text-[#00F0FF] outline-none transition-colors focus:border-[#00F0FF]"
                />
              ))}
            </div>

            {otpNotice && (
              <p className="text-center text-xs text-emerald-400">{otpNotice}</p>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
              >
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-[#94A3B8]">
              <span className="font-mono tabular-nums">
                {resendSeconds > 0
                  ? `Resend OTP in 00:${String(resendSeconds).padStart(2, '0')}`
                  : 'Code expired or not received?'}
              </span>
              <button
                type="button"
                disabled={resendSeconds > 0}
                onClick={handleResendOtp}
                className="inline-flex items-center gap-1 font-medium text-[#00F0FF] disabled:cursor-not-allowed disabled:text-[#64748B]"
              >
                <RotateCcw className="h-3 w-3" />
                Resend
              </button>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] px-4 py-2.5 text-sm font-semibold text-[#05070B] transition-opacity hover:opacity-95"
            >
              Unlock AURA Core
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setErrorMsg('');
              }}
              className="w-full rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
            >
              Back to Sign In
            </button>
          </form>
        )}

        {/* Realistic Google Account Chooser Popup */}
        {googleChooserOpen && (
          <div
            id="google-chooser-modal"
            style={{
              display: 'flex',
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(8px)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999,
              padding: '16px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '350px',
                background: '#0f1626',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '20px',
                padding: '22px',
                textAlign: 'center',
              }}
            >
              <h3 style={{ fontSize: '17px', marginBottom: '4px', color: '#fff' }}>Sign in with Google</h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>
                Choose an account to continue to AURA
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => completeGoogleSignIn('roshan.dev@gmail.com')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#070a12',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', color: '#fff' }}>R</div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600' }}>Roshan Kumar</div>
                    <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>roshan.dev@gmail.com</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => completeGoogleSignIn('aura.explorer@gmail.com')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#070a12',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', color: '#fff' }}>A</div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600' }}>AURA Explorer</div>
                    <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>aura.explorer@gmail.com</div>
                  </div>
                </button>
              </div>

              <input
                type="email"
                id="google-email-input"
                value={googleEmail}
                onChange={(e) => setGoogleEmail(e.target.value)}
                placeholder="Or enter Gmail (e.g. user@gmail.com)"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: '#070a12',
                  color: '#fff',
                  fontSize: '13px',
                  marginBottom: '12px',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => completeGoogleSignIn(googleEmail)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    background: 'linear-gradient(90deg, #00F0FF, #8B5CF6)',
                    color: '#05070B',
                    fontWeight: 600,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    border: 'none',
                  }}
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => setGoogleChooserOpen(false)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#cbd5e1',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
