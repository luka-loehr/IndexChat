"use client";

import { FileText, Mic, Table, Map, Quote, Download, GitCompare, Sparkles } from 'lucide-react';

export default function RightToolbar() {
  const tools = [
    { icon: <FileText size={20} />, label: "Summarize" },
    { icon: <Mic size={20} />, label: "Generate Audio" },
    { icon: <Table size={20} />, label: "Extract Tables" },
    { icon: <Map size={20} />, label: "Concept Map" },
    { icon: <Quote size={20} />, label: "Citations" },
    { icon: <GitCompare size={20} />, label: "Compare" },
    { icon: <Download size={20} />, label: "Export" },
  ];

  return (
    <div className="right-toolbar">
      {tools.map((tool, idx) => (
        <button 
          key={idx}
          className="p-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-all"
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}
      <div className="mt-auto mb-4">
        <button className="p-3 text-[var(--accent)] hover:text-[var(--accent-hover)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-all">
          <Sparkles size={20} />
        </button>
      </div>
    </div>
  );
}
