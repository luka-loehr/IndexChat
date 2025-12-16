"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Upload, FileText, Bot, User, Sparkles } from 'lucide-react';

const API_URL = "http://localhost:3001";

export default function ChatBox({ hasSources, onAddSource }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMessage = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setQuery("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMessage.content }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const data = await response.json();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer,
        sources: data.sources 
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Sorry, I encountered an error while searching your documents." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!hasSources) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-[var(--bg-tertiary)] rounded-2xl flex items-center justify-center mb-6 text-[var(--text-secondary)]">
          <Upload size={32} />
        </div>
        <h2 className="text-xl font-medium mb-2 text-[var(--text-primary)]">Add a source to get started</h2>
        <p className="text-[var(--text-secondary)] mb-8 max-w-md">
          Upload documents, images, or add web links to create a knowledge base for your AI workbench.
        </p>
        <button 
          onClick={onAddSource}
          className="bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity py-2.5 px-6 rounded-lg font-medium flex items-center gap-2"
        >
          <Upload size={18} />
          Upload a source
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center opacity-50">
          <Sparkles size={48} className="text-[var(--accent)] mb-4" />
          <p className="text-[var(--text-secondary)]">Ask me anything about your sources</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[80%] gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="flex flex-col gap-2">
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-tr-sm' 
                      : 'bg-transparent border border-[var(--border)] text-[var(--text-primary)] rounded-tl-sm'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-2 ml-1">
                      {msg.sources.reduce((acc, source) => {
                          if (!acc.find(s => s.file_name === source.file_name)) acc.push(source);
                          return acc;
                        }, []).map((source, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-1 rounded-md border border-[var(--border)]">
                          <FileText size={10} />
                          <span className="truncate max-w-[150px]">{source.file_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0">
                <Bot size={16} />
              </div>
              <div className="flex items-center gap-2 p-4">
                <div className="w-2 h-2 bg-[var(--text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-[var(--text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-[var(--text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="relative max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question..."
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-xl py-3 pl-4 pr-12 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
              disabled={loading}
            />
            <button 
              type="submit"
              disabled={!query.trim() || loading}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] disabled:opacity-50 disabled:hover:text-[var(--text-secondary)] transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
          <div className="text-center mt-2">
            <p className="text-[10px] text-[var(--text-secondary)] opacity-60">
              AI uses context from uploaded sources. Answers may vary based on available data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
