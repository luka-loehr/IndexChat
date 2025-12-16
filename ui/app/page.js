"use client";

import { useState, useEffect, useRef } from 'react';
import LeftSidebar from "../Components/LeftSidebar";
import RightToolbar from "../Components/RightToolbar";
import TopBar from "../Components/TopBar";
import ChatBox from "../Components/ChatBox";

const API_URL = "http://localhost:3001";

export default function Home() {
  const [sources, setSources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef(null);

  const fetchSources = async () => {
    try {
      const res = await fetch(`${API_URL}/files`);
      const data = await res.json();
      // Transform simple file list to object with type
      const transformedSources = (data.files || []).map(filename => {
        const ext = filename.split('.').pop().toLowerCase();
        let type = 'file';
        if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) type = 'pdf'; // Generic doc icon
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) type = 'image';
        if (['mp3', 'wav', 'm4a'].includes(ext)) type = 'audio';
        if (['mp4', 'mov', 'avi'].includes(ext)) type = 'video';
        
        return { name: filename, type };
      });
      setSources(transformedSources);
    } catch (error) {
      console.error("Failed to fetch sources:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleAddSource = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    // Optimistic UI update (optional, but good for UX)
    // For now we just wait for upload

    try {
      // We need to implement this endpoint in server.js
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        // Trigger re-fetch or add to state
        fetchSources();
        // Also trigger indexing in background if not automatic
      } else {
        console.error("Upload failed");
      }
    } catch (error) {
      console.error("Error uploading:", error);
    }
    
    // Reset input
    e.target.value = null;
  };

  return (
    <div className="workbench-container">
      <LeftSidebar sources={sources} onAddSource={handleAddSource} />
      
      <div className="center-panel">
        <TopBar />
        <ChatBox hasSources={sources.length > 0} onAddSource={handleAddSource} />
      </div>

      <RightToolbar />

      {/* Hidden File Input */}
      <input 
        type="file" 
        multiple 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileChange}
      />
    </div>
  );
}
