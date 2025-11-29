"use client";

import { useState, useEffect } from "react";

const API_URL = "http://localhost:3001";

export default function Sidebar() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await fetch(`${API_URL}/files`);
      if (!response.ok) {
        throw new Error("Failed to fetch files");
      }
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error("Error fetching files:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Indexed Files</h2>
        <button className="refresh-btn" onClick={fetchFiles} title="Refresh">
          ↻
        </button>
      </div>
      <div className="sidebar-content">
        {loading && <div className="sidebar-loading">Loading...</div>}
        {error && (
          <div className="sidebar-error">
            <p>Could not connect to server</p>
            <p className="sidebar-hint">Make sure the server is running</p>
          </div>
        )}
        {!loading && !error && files.length === 0 && (
          <div className="sidebar-empty">
            <p>No files indexed yet</p>
            <p className="sidebar-hint">Add PDFs to the input folder and run the indexer</p>
          </div>
        )}
        {!loading && !error && files.length > 0 && (
          <ul className="file-list">
            {files.map((file, index) => (
              <li key={index} className="file-item">
                <span className="file-icon">📄</span>
                <span className="file-name">{file}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sidebar-footer">
        <span className="file-count">{files.length} file{files.length !== 1 ? "s" : ""}</span>
      </div>
    </aside>
  );
}
