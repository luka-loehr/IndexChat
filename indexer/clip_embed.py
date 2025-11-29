#!/usr/bin/env python3
"""
CLIP Text Embedding Helper
Converts text queries to CLIP embeddings for image search.
"""

import sys
import json
from pathlib import Path
import torch
from transformers import CLIPProcessor, CLIPModel

# Global CLIP model cache
_clip_model = None
_clip_processor = None

def get_clip_model():
    """Get or initialize CLIP model and processor."""
    global _clip_model, _clip_processor
    
    if _clip_model is None or _clip_processor is None:
        model_name = "openai/clip-vit-base-patch32"
        _clip_model = CLIPModel.from_pretrained(model_name)
        _clip_processor = CLIPProcessor.from_pretrained(model_name)
        
        # Use CPU if CUDA is not available
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _clip_model = _clip_model.to(device)
        _clip_model.eval()
    
    return _clip_model, _clip_processor

def get_text_embedding(text: str) -> list[float]:
    """Get CLIP text embedding for a query string."""
    model, processor = get_clip_model()
    
    # Process text
    inputs = processor(text=[text], return_tensors="pt", padding=True, truncation=True)
    
    # Move inputs to same device as model
    device = next(model.parameters()).device
    inputs = {k: v.to(device) for k, v in inputs.items()}
    
    # Get text embedding
    with torch.no_grad():
        text_features = model.get_text_features(**inputs)
        # Normalize the embedding
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        embedding = text_features[0].cpu().numpy().tolist()
    
    return embedding

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps([]), file=sys.stderr)
        sys.exit(1)
    
    query = sys.argv[1]
    try:
        embedding = get_text_embedding(query)
        print(json.dumps(embedding))
    except Exception as e:
        print(json.dumps([]), file=sys.stderr)
        sys.exit(1)

