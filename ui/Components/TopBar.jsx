"use client";

import { Share2, Settings, User } from 'lucide-react';

export default function TopBar() {
  return (
    <div className="h-14 border-b border-[var(--border)] flex items-center justify-between px-6 bg-[var(--bg-primary)]">
      <div className="flex items-center gap-4">
        <div className="w-6 h-6 bg-[var(--accent)] rounded-md flex items-center justify-center text-white font-bold text-xs">
          IC
        </div>
        <input 
          type="text" 
          defaultValue="Untitled Notebook" 
          className="bg-transparent border-none focus:outline-none text-[var(--text-primary)] font-medium hover:bg-[var(--bg-tertiary)] px-2 py-1 rounded transition-colors"
        />
      </div>
      
      <div className="flex items-center gap-4">
        <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <Share2 size={18} />
        </button>
        <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <Settings size={18} />
        </button>
        <div className="h-6 w-[1px] bg-[var(--border)]"></div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-[var(--bg-tertiary)] text-[var(--accent)] px-2 py-0.5 rounded-full font-bold tracking-wider">PLUS</span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold cursor-pointer">
            <User size={14} />
          </div>
        </div>
      </div>
    </div>
  );
}
