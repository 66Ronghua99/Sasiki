"""Image processing utilities."""

import io

import cv2
import imagehash
import numpy as np
from PIL import Image


def calculate_similarity(img1: np.ndarray, img2: np.ndarray) -> float:
    """Calculate similarity between two images using perceptual hashing.

    Returns a value between 0 (completely different) and 1 (identical).
    """
    # Convert to PIL for imagehash
    pil1 = Image.fromarray(cv2.cvtColor(img1, cv2.COLOR_BGR2RGB))
    pil2 = Image.fromarray(cv2.cvtColor(img2, cv2.COLOR_BGR2RGB))

    # Calculate perceptual hash
    hash1 = imagehash.phash(pil1)
    hash2 = imagehash.phash(pil2)

    # Calculate similarity (64 is max hash difference)
    diff = hash1 - hash2
    similarity = 1 - (diff / 64.0)

    return max(0, similarity)


def resize_for_llm(image: np.ndarray, max_width: int = 1024) -> np.ndarray:
    """Resize image for LLM analysis while maintaining aspect ratio."""
    height, width = image.shape[:2]

    if width <= max_width:
        return image

    ratio = max_width / width
    new_height = int(height * ratio)
    new_width = max_width

    resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
    return resized


def encode_image_base64(image: np.ndarray, quality: int = 85) -> str:
    """Encode image to base64 string for API transmission."""
    import base64

    # Convert BGR to RGB
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB) if len(image.shape) == 3 else image

    # Encode as JPEG
    pil_image = Image.fromarray(rgb_image)
    buffer = io.BytesIO()
    pil_image.save(buffer, format="JPEG", quality=quality)
    buffer.seek(0)

    return base64.b64encode(buffer.read()).decode("utf-8")


def detect_content_type(image: np.ndarray) -> str:
    """Detect if image is text-heavy or UI-heavy to optimize processing."""
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Calculate edge density (UI elements have more edges)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / edges.size

    # Calculate text-like regions (high contrast areas)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    text_like_ratio = np.sum(binary == 0) / binary.size

    # Heuristic classification
    if edge_density > 0.05 and text_like_ratio > 0.3:
        return "mixed"  # Both text and UI
    elif edge_density > 0.08:
        return "ui"     # UI-heavy
    else:
        return "text"   # Text-heavy


def get_optimal_resolution(image: np.ndarray) -> int:
    """Determine optimal resolution for image based on content type."""
    content_type = detect_content_type(image)

    if content_type == "text":
        return 1536  # Higher resolution for text
    elif content_type == "ui":
        return 768   # Lower for UI
    else:
        return 1024  # Medium for mixed
