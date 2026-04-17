import gradio as gr
from ultralytics import YOLO
import cv2
import numpy as np

# Load YOUR trained model
model = YOLO("best.pt")

def detect_shrimp(image):
    # Run inference
    results = model(image)
    
    # Get image with bounding boxes drawn
    annotated_img = results[0].plot()
    
    # Convert colors for Gradio
    annotated_img = cv2.cvtColor(annotated_img, cv2.COLOR_BGR2RGB)
    
    # Count the shrimp
    count = len(results[0].boxes)
    
    # Get average confidence
    confidences = results[0].boxes.conf.cpu().numpy()
    avg_conf = np.mean(confidences) * 100 if len(confidences) > 0 else 0
    
    # Format output text
    result_text = f"""
    ### 🦐 Detection Results
    | Metric | Value |
    |---|---|
    | **Post-larvae Count** | {count} |
    | **Average Confidence** | {avg_conf:.1f}% |
    """
    
    return annotated_img, result_text

# Build the Web Interface
with gr.Blocks(title="Shrimp Detector") as demo:
    gr.Markdown("# 🦐 Shrimp Post-Larvae Detection System")
    gr.Markdown("Upload an image containing shrimp post-larvae to detect and count them.")
    
    with gr.Row():
        with gr.Column():
            input_img = gr.Image(type="numpy", label="Upload Image Here")
            btn = gr.Button("🔍 Detect Shrimp", variant="primary")
            
        with gr.Column():
            output_img = gr.Image(type="numpy", label="Detection Output")
            output_txt = gr.Markdown()
            
    # Connect the button to the function
    btn.click(fn=detect_shrimp, inputs=input_img, outputs=[output_img, output_txt])

# Start the app
if __name__ == "__main__":
    demo.launch()