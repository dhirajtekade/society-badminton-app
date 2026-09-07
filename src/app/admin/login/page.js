"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup 
} from "firebase/auth";
import { setAdminSession } from "@/app/actions/auth";
import { ShieldCheck, Lock, Mail } from "lucide-react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Email & Password Login
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      await setAdminSession();
    } catch (err) {
      console.error("Email login error:", err);
      setError("Invalid email or password. Access denied.");
      setIsLoading(false);
    }
  };

  // Google / Gmail Login
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      await setAdminSession();
    } catch (err) {
      console.error("Google sign-in error:", err);
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Failed to sign in with Google. Please try again.");
      }
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-8 text-center border border-gray-200">
        
        <div className="bg-indigo-900 text-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 shadow-md">
          <ShieldCheck size={32} />
        </div>
        
        <h1 className="text-2xl font-black text-gray-900 mb-2">Organizer Login</h1>
        <p className="text-gray-500 text-sm font-medium mb-6">
          Secure access to tournament administration.
        </p>

        {/* Google Sign-in Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading || isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-xl shadow-sm transition-all disabled:opacity-60 text-sm mb-5"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          {isGoogleLoading ? "Connecting..." : "Sign in with Google"}
        </button>

        {/* Divider */}
        <div className="flex items-center my-4">
          <div className="flex-1 border-t border-gray-200" />
          <span className="px-3 text-xs font-bold text-gray-400 uppercase">Or with Email</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>
        
        {/* Email & Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4 text-left">
          <div className="relative">
            <Mail size={20} className="absolute left-4 top-3.5 text-gray-400" />
            <input 
              type="email" 
              placeholder="Admin Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-600 transition-colors bg-gray-50 focus:bg-white"
            />
          </div>

          <div className="relative">
            <Lock size={20} className="absolute left-4 top-3.5 text-gray-400" />
            <input 
              type="password" 
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-600 transition-colors bg-gray-50 focus:bg-white"
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs font-bold mt-2 animate-in slide-in-from-top-1 text-center">
              {error}
            </p>
          )}
          
          <button 
            type="submit" 
            disabled={isLoading || isGoogleLoading}
            className="w-full bg-indigo-900 hover:bg-indigo-800 disabled:bg-indigo-400 text-white font-black py-3.5 rounded-xl shadow-md transition-all mt-4"
          >
            {isLoading ? "Authenticating..." : "Login with Email"}
          </button>
        </form>
      </div>
    </div>
  );
}