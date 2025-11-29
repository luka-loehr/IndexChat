"use client";

import { useState } from "react";

const API_URL = "http://localhost:3001";

export default function ChatBox() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setAnswer("");
    setSources([]);

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response");
      }

      const data = await response.json();
      setAnswer(data.answer);
      setSources(data.sources || []);
    } catch (err) {
      console.error("Error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Get unique file names for display
  const uniqueSources = sources.reduce((acc, source) => {
    if (!acc.find((s) => s.file_name === source.file_name)) {
      acc.push(source);
    }
    return acc;
  }, []);

  return (
    <div className="chat-container">
      <div className="input-section">
        <form onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your documents..."
              disabled={loading}
              autoFocus
            />
            <button type="submit" disabled={loading || !query.trim()}>
              {loading ? "Searching..." : "Ask"}
            </button>
          </div>
        </form>
      </div>

      <div className="response-section">
        {loading && (
          <div className="loading">
            <div className="loading-spinner" />
            <span>Searching documents and generating answer...</span>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {!loading && !error && answer && (
          <>
            <div className="answer">{answer}</div>

            {uniqueSources.length > 0 && (
              <div className="sources">
                <h3>Sources</h3>
                <div className="sources-list">
                  {uniqueSources.map((source, index) => (
                    <span key={`${source.file_name}-${index}`} className="source-tag">
                      <span className="file-icon">📄</span>
                      {source.file_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !error && !answer && (
          <div className="empty-state">
            <p>Ready to answer your questions</p>
            <p className="hint">
              Make sure you have indexed some PDFs first using the indexer
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
