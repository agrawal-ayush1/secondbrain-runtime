import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  Mail,
  KeyRound,
  X,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    requestOtp,
    verifyOtp,
    authError,
    clearError,
  } = useAuth();

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('ayushagra2005@gmail.com');
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [expiryCountdown, setExpiryCountdown] = useState(300);

  // Resend cooldown timer
  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Expiry countdown timer
  useEffect(() => {
    let timer: any;
    if (step === 'otp' && expiryCountdown > 0) {
      timer = setInterval(() => {
        setExpiryCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, expiryCountdown]);

  if (!isAuthModalOpen) return null;

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    clearError();
    try {
      await requestOtp(email.trim());
      setStep('otp');
      setResendCooldown(60);
      setExpiryCountdown(300);
      setOtp('');
    } catch {
      // Error handled in AuthContext authError
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;

    setIsSubmitting(true);
    clearError();
    try {
      await verifyOtp(email.trim(), otp.trim());
      // Wipe OTP from local component state
      setOtp('');
    } catch {
      // Error handled in AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || isSubmitting) return;

    setIsSubmitting(true);
    clearError();
    try {
      await requestOtp(email.trim());
      setResendCooldown(60);
      setExpiryCountdown(300);
      setOtp('');
    } catch {
      // Error handled in AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-surface-container-low border border-outline-variant/40 rounded-2xl p-6 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                Operator Sign-In
              </h2>
              <p className="text-xs font-mono text-outline">
                SMTP Email Verification &bull; Real Auth Flow
              </p>
            </div>
          </div>
          <button
            onClick={closeAuthModal}
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Global Error Banner */}
        {authError && (
          <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/40 rounded-xl flex items-start gap-3 animate-fade-in">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs font-mono text-red-300 leading-relaxed">
              <span className="font-semibold block mb-0.5 text-red-200">
                Authentication Error
              </span>
              {authError}
            </div>
          </div>
        )}

        {/* STEP 1: Request OTP */}
        {step === 'email' ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-outline mb-1.5">
                Registered Operator Email
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sre-admin@secondbrain.ai"
                  className="w-full pl-9 pr-3 py-2.5 bg-surface-container-high border border-outline-variant/40 rounded-xl text-xs font-mono text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
            </div>

            {/* Account Quick Selectors */}
            <div>
              <span className="block text-[11px] font-mono text-outline/70 mb-1.5">
                Preset Registered Accounts:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'ayushagra2005@gmail.com',
                  'sre-admin@secondbrain.ai',
                  'operator@secondbrain.ai',
                  'admin@secondbrain.ai',
                ].map((acc) => (
                  <button
                    key={acc}
                    type="button"
                    onClick={() => setEmail(acc)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-all ${
                      email === acc
                        ? 'bg-primary/20 border-primary/50 text-primary'
                        : 'bg-surface-container border-outline-variant/30 text-outline hover:text-on-surface'
                    }`}
                  >
                    {acc.split('@')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-hover text-on-primary font-mono text-xs font-semibold rounded-xl transition-all shadow-md active:scale-98 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Sending Code via SMTP...</span>
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    <span>Send Verification Code</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] font-mono text-outline/70 text-center leading-relaxed">
              Real SMTP delivery. Check your inbox for the 6-digit verification code.
            </p>
          </form>
        ) : (
          /* STEP 2: Verify OTP */
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="p-3 bg-surface-container/60 border border-outline-variant/30 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-mono text-on-surface">
                  Code sent to <strong className="text-primary">{email}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-[11px] font-mono text-outline hover:text-primary underline"
              >
                Change
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-mono text-outline">
                  6-Digit Verification Code
                </label>
                <span className="text-[11px] font-mono text-amber-400">
                  Expires in {formatTime(expiryCountdown)}
                </span>
              </div>
              <div className="relative">
                <KeyRound className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full pl-9 pr-3 py-2.5 bg-surface-container-high border border-outline-variant/40 rounded-xl text-sm font-mono tracking-widest text-center text-primary font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || otp.length !== 6 || expiryCountdown <= 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-hover text-on-primary font-mono text-xs font-semibold rounded-xl transition-all shadow-md active:scale-98 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Verify & Sign In</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || isSubmitting}
                className="text-xs font-mono text-outline hover:text-primary disabled:opacity-40 transition-colors"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend Verification Code'}
              </button>

              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-xs font-mono text-outline hover:text-on-surface"
              >
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
