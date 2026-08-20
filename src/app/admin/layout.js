"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Menu, X, Users, CalendarDays, UploadCloud, 
  Settings, Layout, MonitorPlay, Trophy, ListOrdered 
} from "lucide-react";

export default function AdminLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Define our navigation links based on what we've built (and what's coming)
const navLinks = [
    { name: "Match Schedule", href: "/admin/matches", icon: CalendarDays },
    { name: "Player Directory", href: "/admin/players", icon: Users },
    { name: "Category Sorter", href: "/admin/categories", icon: Layout }, // <-- CHANGED HERE
    { name: "Bulk Upload", href: "/admin/upload", icon: UploadCloud },
    { name: "Global Settings", href: "/admin/settings", icon: Settings },
    { name: "Live Scorer", href: "/admin/scorer", icon: MonitorPlay },
    { name: "Match Ledger", href: "/admin/ledger", icon: ListOrdered },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      
      {/* --- MOBILE TOP BAR --- */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-indigo-900 text-white z-50 flex items-center justify-between px-4 shadow-md">
        <div className="flex items-center gap-2 font-bold text-lg">
          <Trophy size={20} className="text-yellow-400" />
          Tournament Admin
        </div>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 hover:bg-indigo-800 rounded-lg transition-colors"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* --- SIDEBAR OVERLAY (MOBILE) --- */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* --- SIDEBAR NAVIGATION --- */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 shadow-xl md:shadow-none
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0 md:static md:flex-shrink-0
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 bg-indigo-900 text-white md:bg-white md:text-indigo-900">
          <div className="flex items-center gap-2 font-black text-lg tracking-tight">
            <Trophy size={24} className="text-yellow-400 md:text-indigo-600" />
            <span className="hidden md:block">CourtAdmin</span>
            <span className="md:hidden">Menu</span>
          </div>
          {/* Close button only visible on mobile */}
          <button 
            className="md:hidden p-1 hover:bg-indigo-800 rounded-lg"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-4rem)]">
          <div className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4 px-3 mt-4">
            Management
          </div>
          
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            
            return (
              <Link 
                key={link.href} 
                href={link.href}
                onClick={() => setIsSidebarOpen(false)} // Auto-close on mobile tap
                className={`
                  flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-all
                  ${isActive 
                    ? "bg-indigo-50 text-indigo-700" 
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}
                `}
              >
                <Icon size={18} className={isActive ? "text-indigo-600" : "text-gray-400"} />
                {link.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 w-full pt-16 md:pt-0">
        {/* The current page's content is injected here via the 'children' prop */}
        {children}
      </main>
      
    </div>
  );
}