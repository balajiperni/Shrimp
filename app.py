import os
import io
import uuid
import time
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from ultralytics import YOLO
from PIL import Image
import cv2
import numpy as np

# ─── Configuration ───────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "best.pt"
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# ─── Load Model ──────────────────────────────────────────────────────────────

print("Loading YOLOv8 model...")
model = YOLO(str(MODEL_PATH))
print("Model loaded successfully!")

# ─── FastAPI App ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Shrimp Count Detector",
    description="YOLOv8-based shrimp detection and counting API",
    version="1.0.0",
)

# CORS middleware for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


# ─── Helper Functions ────────────────────────────────────────────────────────

def validate_image(file: UploadFile) -> None:
    """Validate uploaded image file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )


def generate_unique_filename(extension: str) -> str:
    """Generate a unique filename using UUID."""
    return f"{uuid.uuid4().hex}{extension}"


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the main frontend page."""
    html_path = BASE_DIR / "templates" / "index.html"
    return HTMLResponse(content=html_path.read_text(encoding="utf-8"))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "model": "loaded"}


@app.post("/detect")
async def detect_shrimp(file: UploadFile = File(...)):
    """
    Upload an image and detect/count shrimp using YOLOv8.

    Returns:
        - shrimp_count: Number of shrimp detected
        - confidence_scores: List of confidence scores for each detection
        - annotated_image_url: URL to the annotated image
        - processing_time: Time taken for detection in seconds
    """
    start_time = time.time()

    # Validate the uploaded file
    validate_image(file)

    # Read the image
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB",
        )

    # Convert to OpenCV format
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="Could not read image file")

    # Run YOLOv8 detection
    results = model(img, conf=CONFIDENCE_THRESHOLD)

    # Extract detection data
    detections = []
    confidence_scores = []
    boxes_data = []

    for result in results:
        boxes = result.boxes
        if boxes is not None and len(boxes) > 0:
            for i in range(len(boxes)):
                box = boxes[i]
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = model.names[class_id]

                detections.append({
                    "class": class_name,
                    "confidence": round(confidence, 4),
                    "bbox": {
                        "x1": round(x1, 2),
                        "y1": round(y1, 2),
                        "x2": round(x2, 2),
                        "y2": round(y2, 2),
                    },
                })
                confidence_scores.append(round(confidence, 4))
                boxes_data.append([x1, y1, x2, y2, confidence, class_id])

    # Create annotated image
    annotated_img = img.copy()

    # Draw bounding boxes with custom styling
    for det in detections:
        bbox = det["bbox"]
        conf = det["confidence"]
        x1, y1, x2, y2 = int(bbox["x1"]), int(bbox["y1"]), int(bbox["x2"]), int(bbox["y2"])

        # Draw bounding box
        cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 255, 127), 2)

        # Draw label background
        label = f"{det['class']} {conf:.2f}"
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        font_thickness = 2
        (label_w, label_h), baseline = cv2.getTextSize(label, font, font_scale, font_thickness)
        cv2.rectangle(
            annotated_img,
            (x1, y1 - label_h - baseline - 6),
            (x1 + label_w + 6, y1),
            (0, 255, 127),
            -1,
        )

        # Draw label text
        cv2.putText(
            annotated_img,
            label,
            (x1 + 3, y1 - baseline - 3),
            font,
            font_scale,
            (0, 0, 0),
            font_thickness,
        )

    # Add count overlay at top
    count_text = f"Shrimp Count: {len(detections)}"
    count_font = cv2.FONT_HERSHEY_SIMPLEX
    count_scale = 1.2
    count_thickness = 3
    (ct_w, ct_h), ct_baseline = cv2.getTextSize(count_text, count_font, count_scale, count_thickness)
    cv2.rectangle(annotated_img, (10, 10), (ct_w + 30, ct_h + ct_baseline + 30), (0, 0, 0), -1)
    cv2.putText(
        annotated_img,
        count_text,
        (20, ct_h + 20),
        count_font,
        count_scale,
        (0, 255, 127),
        count_thickness,
    )

    # Save annotated image
    ext = Path(file.filename).suffix.lower()
    result_filename = generate_unique_filename(ext)
    result_path = UPLOAD_DIR / result_filename
    cv2.imwrite(str(result_path), annotated_img)

    processing_time = round(time.time() - start_time, 3)

    # Calculate average confidence
    avg_confidence = (
        round(sum(confidence_scores) / len(confidence_scores), 4)
        if confidence_scores
        else 0
    )

    return JSONResponse(
        content={
            "success": True,
            "shrimp_count": len(detections),
            "detections": detections,
            "confidence_scores": confidence_scores,
            "average_confidence": avg_confidence,
            "annotated_image_url": f"/static/uploads/{result_filename}",
            "processing_time": processing_time,
        }
    )


@app.get("/detections")
async def list_detections():
    """List all uploaded detection result images."""
    files = []
    for f in UPLOAD_DIR.iterdir():
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS:
            files.append({
                "filename": f.name,
                "url": f"/static/uploads/{f.name}",
                "size": f.stat().st_size,
            })
    return {"files": files}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
