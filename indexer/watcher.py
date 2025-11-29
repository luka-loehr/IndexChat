#!/usr/bin/env python3
"""
IndexChat PDF & Image Watcher
Watches the input directory for PDF and image changes and triggers reindexing.
"""

import subprocess
import sys
import time
from pathlib import Path
from threading import Timer

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

# Configuration
INPUT_DIR = Path(__file__).parent.parent / "input"
INDEXER_SCRIPT = Path(__file__).parent / "indexer.py"
DEBOUNCE_SECONDS = 2.0

# Supported file extensions
PDF_EXTENSIONS = {".pdf"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
WATCHED_EXTENSIONS = PDF_EXTENSIONS | IMAGE_EXTENSIONS


class FileWatcherHandler(FileSystemEventHandler):
    """Handler for PDF and image file system events with debouncing."""
    
    def __init__(self):
        super().__init__()
        self._timer: Timer | None = None
        self._is_rebuilding = False
    
    def _is_watched_file(self, event: FileSystemEvent) -> bool:
        """Check if the event is related to a watched file (PDF or image)."""
        if event.is_directory:
            return False
        src_path = Path(event.src_path)
        return src_path.suffix.lower() in WATCHED_EXTENSIONS
    
    def _schedule_rebuild(self):
        """Schedule a rebuild with debouncing."""
        if self._timer is not None:
            self._timer.cancel()
        
        self._timer = Timer(DEBOUNCE_SECONDS, self._run_rebuild)
        self._timer.start()
        print(f"Rebuild scheduled in {DEBOUNCE_SECONDS} seconds...")
    
    def _run_rebuild(self):
        """Run the indexer rebuild."""
        if self._is_rebuilding:
            print("Rebuild already in progress, skipping...")
            return
        
        self._is_rebuilding = True
        print("\n" + "=" * 50)
        print("Rebuilding index...")
        print("=" * 50 + "\n")
        
        try:
            result = subprocess.run(
                [sys.executable, str(INDEXER_SCRIPT), "--build"],
                capture_output=False,
                text=True
            )
            if result.returncode == 0:
                print("\nIndex rebuild completed successfully!")
            else:
                print(f"\nIndex rebuild failed with code {result.returncode}")
        except Exception as e:
            print(f"\nError running indexer: {e}")
        finally:
            self._is_rebuilding = False
            print("\nWatching for changes...")
    
    def on_created(self, event: FileSystemEvent):
        """Handle file creation."""
        if self._is_watched_file(event):
            file_type = "PDF" if Path(event.src_path).suffix.lower() == ".pdf" else "Image"
            print(f"{file_type} created: {Path(event.src_path).name}")
            self._schedule_rebuild()
    
    def on_modified(self, event: FileSystemEvent):
        """Handle file modification."""
        if self._is_watched_file(event):
            file_type = "PDF" if Path(event.src_path).suffix.lower() == ".pdf" else "Image"
            print(f"{file_type} modified: {Path(event.src_path).name}")
            self._schedule_rebuild()
    
    def on_deleted(self, event: FileSystemEvent):
        """Handle file deletion."""
        if self._is_watched_file(event):
            file_type = "PDF" if Path(event.src_path).suffix.lower() == ".pdf" else "Image"
            print(f"{file_type} deleted: {Path(event.src_path).name}")
            self._schedule_rebuild()
    
    def on_moved(self, event: FileSystemEvent):
        """Handle file move/rename."""
        if self._is_watched_file(event):
            file_type = "PDF" if Path(event.src_path).suffix.lower() == ".pdf" else "Image"
            print(f"{file_type} moved: {Path(event.src_path).name}")
            self._schedule_rebuild()


def main():
    """Main entry point for the watcher."""
    # Ensure input directory exists
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    print("=" * 50)
    print("IndexChat PDF & Image Watcher")
    print("=" * 50)
    print(f"\nWatching directory: {INPUT_DIR}")
    print(f"Debounce delay: {DEBOUNCE_SECONDS} seconds")
    print("\nWaiting for PDF and image changes...")
    print("Press Ctrl+C to stop\n")
    
    # Set up the observer
    event_handler = FileWatcherHandler()
    observer = Observer()
    observer.schedule(event_handler, str(INPUT_DIR), recursive=False)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\nStopping watcher...")
        observer.stop()
    
    observer.join()
    print("Watcher stopped.")


if __name__ == "__main__":
    main()
