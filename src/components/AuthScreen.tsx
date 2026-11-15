import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ShieldCheck, ArrowRight, User } from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { BOSS_ADMIN_PIN, isBossAdminLogin } from '../utils/auraLogic';
import type { AuthUser } from '../types/aura';

const firebaseConfig = {
  apiKey: "AIzaSyCALOqr4deLxHZgBYY5mkCDaw3vZmL1jPc",
  authDomain: "plasma-wallaby-5c62s.firebaseapp.com",
  projectId: "plasma-wallaby-5c62s",
  storageBucket: "plasma-wallaby-5c62s.firebasestorage.app",
  messagingSenderId: "1022366635526",
  appId: "1:1022366635526:web:4e9b8b65d694acf483d587",
};

const GOOGLE_WEB_CLIENT_ID =
  "624490697015-8p71i41iotko6rjtoc0t0g1qe9bhr96i.apps.googleusercontent.com";

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

declare global {
  interface Window {
    google?: any;
  }
}

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser, openAdminImmediately: boolean) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  // Google से टोकन मिलते ही सीधे Firebase में लॉग-इन करना (बिना किसी Redirect या सफ़ेद स्क्रीन के)
  const handleGoogleCredential = async (response: any) => {
    if (!response?.credential) {
      setErrorMsg('Google से टोकन नहीं मिल पाया। कृपया दोबारा प्रयास करें।');
      return;
    }

    setErrorMsg('');
    setLoading(true);
    try {
      const credential = GoogleAuthProvider.credential(response.credential);
      const result = await signInWithCredential(auth, credential);
      const userEmail = result.user.email || 'google-user@aura.ai';

      onAuthenticated(
        {
          identifier: userEmail,
          role: 'user',
          loggedInAt: Date.now(),
        },
        false
      );
    } catch (err: any) {
      setErrorMsg('Google लॉग-इन विफल रहा: ' + (err?.message || 'कृपया पुनः प्रयास करें'));
    } finally {
      setLoading(false);
    }
  };

  // Direct Google Identity Services लोड करना
  useEffect(() => {
    const initGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_WEB_CLIENT_ID,
        callback: handleGoogleCredential,
        ux_mode: 'popup',
      });

      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: googleBtnRef.current.offsetWidth || 320,
        text: 'continue_with',
        shape: 'rectangular',
      });

      setGoogleReady(true);
    };

    if (window.google?.accounts?.id) {
      initGoogleButton();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGoogleButton;
    script.onerror = () => {
      setErrorMsg('Google सेवा लोड नहीं हो सकी। कृपया इंटरनेट कनेक्शन जांचें।');
    };
    document.body.appendChild(script);
  }, []);

  // Email और Password लॉग-इन / नया अकाउंट
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg('कृपया ईमेल और पासवर्ड दोनों डालें।');
      return;
    }

    // Boss Admin चेक
    const adminMatch = isBossAdminLogin(trimmedEmail, password);
    if (adminMatch) {
      onAuthenticated(
        {
          identifier: trimmedEmail,
          role: 'admin',
          loggedInAt: Date.now(),
        },
        password.trim() === BOSS_ADMIN_PIN
      );
      return;
    }

    setLoading(true);
    try {
      const cred = isSignUp
        ? await createUserWithEmailAndPassword(auth, trimmedEmail, password)
        : await signInWithEmailAndPassword(auth, trimmedEmail, password);

      onAuthenticated(
        {
          identifier: cred.user.email || trimmedEmail,
          role: 'user',
          loggedInAt: Date.now(),
        },
        false
      );
    } catch (err: any) {
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        setErrorMsg('ईमेल या पासवर्ड गलत है। कृपया दोबारा जांचें।');
      } else if (err?.code === 'auth/user-not-found') {
        setErrorMsg('इस ईमेल से कोई अकाउंट नहीं मिला। पहले नया अकाउंट बनाएं।');
      } else if (err?.code === 'auth/email-already-in-use') {
        setErrorMsg('यह ईमेल पहले से रजिस्टर है। कृपया लॉग-इन करें।');
      } else if (err?.code === 'auth/weak-password') {
        setErrorMsg('पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।');
      } else {
        setErrorMsg(err?.message || 'लॉग-इन में समस्या आई।');
      }
    } finally {
      setLoading(false);
    }
  };

  // Guest मोड
  const handleGuestContinue = () => {
    onAuthenticated(
      {
        identifier: 'guest@aura.local',
        role: 'guest',
        loggedInAt: Date.now(),
      },
      false
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#060812] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md bg-[#0e1224]/90 border border-cyan-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center mb-3">
            <ShieldCheck className="w-6 h-6 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-wide text-white">AURA AI</h1>
          <p className="text-xs text-slate-400 mt-1">
            सुरक्षित और असली अकाउंट से आगे बढ़ें
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* Direct Google Sign-In बटन */}
        <div className="w-full flex flex-col items-center">
          <div
            ref={googleBtnRef}
            className="w-full flex justify-center min-h-[44px] rounded-xl overflow-hidden"
          />
          {!googleReady && (
            <div className="w-full text-center py-3 rounded-xl bg-white/10 text-xs text-slate-300">
              Google बटन लोड हो रहा है...
            </div>
          )}
        </div>

        <div className="flex items-center my-5">
          <div className="flex-1 border-t border-white/10" />
          <span className="px-3 text-[11px] uppercase tracking-wider text-slate-400">
            या ईमेल और पासवर्ड से
          </span>
          <div className="flex-1 border-t border-white/10" />
        </div>

        {/* Email & Password फ़ॉर्म */}
        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          <div>
            <input
              type="email"
              required
              placeholder="अपना ईमेल डालें (जैसे name@gmail.com)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 transition"
            />
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              placeholder="पासवर्ड (कम से कम 6 अक्षर)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 pr-11 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 active:scale-[0.99] transition disabled:opacity-50 shadow-lg"
          >
            <span>{isSignUp ? 'नया अकाउंट बनाएं (Sign Up)' : 'लॉग-इन करें (Sign In)'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg('');
            }}
            className="text-xs text-cyan-400 hover:underline"
          >
            {isSignUp
              ? 'पहले से अकाउंट है? लॉग-इन करें'
              : 'नया अकाउंट बनाना चाहते हैं? रजिस्टर करें'}
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleGuestContinue}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs text-slate-300 bg-white/5 hover:bg-white/10 transition"
          >
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span>बिना लॉग-इन के आगे बढ़ें (Guest Mode)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
