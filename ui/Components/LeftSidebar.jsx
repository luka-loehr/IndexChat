"use client";

import { useState } from 'react';
import { Search, Plus, FileText, Image, Globe, Mic, Folder, HardDrive, MoreHorizontal } from 'lucide-react';

export default function LeftSidebar({ sources = [], onAddSource }) {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="left-sidebar">
      <div className="p-4 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4 flex items-center gap-2">
          Sources Brain
        </h2>
        
        <button 
          onClick={onAddSource}
          className="w-full bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity py-2 px-4 rounded-md font-medium flex items-center justify-center gap-2 mb-4"
        >
          <Plus size={16} />
          Add Sources
        </button>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)]" size={14} />
          <input 
            type="text" 
            placeholder="Search sources..." 
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-md py-1.5 pl-9 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sources.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-[var(--text-secondary)] text-sm mb-2">No sources yet</p>
            <p className="text-[var(--text-secondary)] text-xs opacity-60">Upload documents or add links to get started</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sources
              .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((source, idx) => (
              <div key={idx} className="group flex items-center gap-3 p-2 rounded-md hover:bg-[var(--bg-tertiary)] cursor-pointer text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                {source.type === 'pdf' && <FileText size={14} />}
                {source.type === 'image' && <Image size={14} />}
                {source.type === 'web' && <Globe size={14} />}
                {source.type === 'audio' && <Mic size={14} />}
                <span className="truncate flex-1">{source.name}</span>
                <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--bg-primary)] rounded">
                  <MoreHorizontal size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex items-center justify-between text-[var(--text-secondary)] text-xs">
          <span>{sources.length} sources</span>
          <div className="flex gap-2">
            <HardDrive size={12} />
            <span>Local</span>
          </div>
        </div>
      </div>
    </div>
  );
}
