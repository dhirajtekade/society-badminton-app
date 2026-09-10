"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase"; // NEW: Import Firebase auth instance
import { signInWithEmailAndPassword } from "firebase/auth"; // NEW: Import sign-in method
import { verifyScorerPin } from "@/app/actions/auth";
import { MonitorPlay, Lock } from "lucide-react";

export default function ScorerLogin() {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.target);
    const pin = formData.get("pin"); // Extract the PIN for Firebase

    try {
      // 1. Authenticate with Firebase using a hidden referee account
      // This grants the browser permission to WRITE to the database
      await signInWithEmailAndPassword(
        auth,
        "scorer@tournament.com",
        `scorer${pin}`,
      );

      // 2. Run your existing Next.js server action to set the web cookie
      const result = await verifyScorerPin(formData);

      if (result?.error) {
        setError(result.error);
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Login failed:", err);
      setError("Invalid PIN. Access denied.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-8 text-center border border-gray-200">
        <div className="bg-indigo-100 text-indigo-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
          <MonitorPlay size={32} />
        </div>

        <h1 className="text-2xl font-black text-gray-900 mb-2">Referee Zone</h1>
        <p className="text-gray-500 text-sm font-medium mb-8">
          Enter the tournament PIN to access the Live Scorer dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="relative">
              <Lock
                size={20}
                className="absolute left-4 top-3.5 text-gray-400"
              />
              <input
                type="password"
                name="pin"
                maxLength={4}
                placeholder="PIN"
                required
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl text-center text-xl font-black tracking-[0.75em] outline-none focus:border-indigo-600 transition-colors bg-gray-50 focus:bg-white"
              />
            </div>
            {error && (
              <p className="text-red-500 text-xs font-bold mt-2 animate-in slide-in-from-top-1">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black py-3.5 rounded-xl shadow-md transition-all active:scale-95"
          >
            {isLoading ? "Verifying..." : "Enter Dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
