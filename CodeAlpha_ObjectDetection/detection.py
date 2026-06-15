# =====================================================
# CodeAlpha - Object Detection + Image Upload
# Task 4 - AI Internship
# YOLOv8 + OpenCV + Flask + Image Upload
# =====================================================

from flask import Flask, render_template, Response, jsonify, request
from flask_cors import CORS
import cv2
import numpy as np
import base64
import time
import os
from ultralytics import YOLO
from werkzeug.utils import secure_filename
from PIL import Image
from io import BytesIO

# ── Initialize Flask ───────────────────────────────
app  = Flask(__name__)
CORS(app)

# ── Load YOLO Model ────────────────────────────────
print("⏳ Loading YOLO model...")
model = YOLO('yolov8n.pt')
print("✅ YOLO Model Loaded!")

# ── Upload Settings ────────────────────────────────
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ── Global Variables ───────────────────────────────
camera          = None
is_detecting    = False
detection_stats = {
    'total_objects'  : 0,
    'current_objects': 0,
    'fps'            : 0,
    'objects_found'  : {}
}

COLORS = {}

def get_color(class_id):
    """Get unique color for each class"""
    if class_id not in COLORS:
        np.random.seed(class_id)
        COLORS[class_id] = tuple(
            np.random.randint(100, 255, 3).tolist()
        )
    return COLORS[class_id]


# =====================================================
# OBJECT DETECTION FUNCTION
# =====================================================
def detect_objects(frame):
    """Run YOLO detection on a frame"""
    global detection_stats

    start_time = time.time()

    # Run YOLO
    results = model(frame, conf=0.4, verbose=False)

    objects_found = {}
    object_count  = 0

    for result in results:
        boxes = result.boxes

        if boxes is not None:
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                class_id   = int(box.cls[0])
                confidence = float(box.conf[0])
                class_name = model.names[class_id]

                color = get_color(class_id)

                # Draw box
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                # Draw label
                label      = f"{class_name} {confidence:.0%}"
                label_size = cv2.getTextSize(
                    label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
                )[0]

                cv2.rectangle(
                    frame,
                    (x1, y1 - label_size[1] - 12),
                    (x1 + label_size[0] + 8, y1),
                    color, -1
                )

                cv2.putText(
                    frame, label, (x1 + 4, y1 - 6),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6, (255, 255, 255), 2
                )

                object_count += 1
                objects_found[class_name] = \
                    objects_found.get(class_name, 0) + 1

    # Calculate FPS
    fps = 1 / (time.time() - start_time + 0.001)

    # Draw info panel
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (frame.shape[1], 50),
                  (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    cv2.putText(frame, f"FPS: {fps:.1f}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 100), 2)
    cv2.putText(frame, f"Objects: {object_count}", (150, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 200, 0), 2)
    cv2.putText(frame, "CodeAlpha AI",
                (frame.shape[1] - 180, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (150, 150, 255), 2)

    # Update stats
    detection_stats['fps']            = round(fps, 1)
    detection_stats['current_objects']= object_count
    detection_stats['objects_found']  = objects_found
    detection_stats['total_objects'] += object_count

    return frame, objects_found


# =====================================================
# VIDEO STREAM GENERATOR
# =====================================================
def generate_frames():
    """Generate video frames for streaming"""
    global camera, is_detecting

    camera = cv2.VideoCapture(0)
    camera.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    while is_detecting:
        success, frame = camera.read()
        if not success:
            break

        frame = cv2.flip(frame, 1)
        frame, _ = detect_objects(frame)

        ret, buffer = cv2.imencode('.jpg', frame,
                                   [cv2.IMWRITE_JPEG_QUALITY, 85])
        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n'
               + frame_bytes + b'\r\n')

    if camera:
        camera.release()
        camera = None


# =====================================================
# IMAGE UPLOAD DETECTION
# =====================================================
@app.route('/upload_image', methods=['POST'])
def upload_image():
    """Upload image and detect objects"""
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file uploaded'
            }), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400

        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Use JPG, PNG, or GIF'
            }), 400

        # Read Image
        img = Image.open(file.stream)
        img_array = np.array(img)

        # Convert to BGR for OpenCV
        if len(img_array.shape) == 2:  # Grayscale
            frame = cv2.cvtColor(img_array, cv2.COLOR_GRAY2BGR)
        elif img_array.shape[2] == 4:  # RGBA
            frame = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGR)
        else:  # RGB
            frame = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        # Run YOLO Detection
        results = model(frame, conf=0.3, verbose=False)

        objects_detected = []
        detection_count  = 0

        for result in results:
            boxes = result.boxes

            if boxes is not None:
                for box in boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    class_id   = int(box.cls[0])
                    confidence = float(box.conf[0])
                    class_name = model.names[class_id]

                    color = get_color(class_id)

                    # Draw bounding box
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)

                    # Draw label
                    label      = f"{class_name} {confidence:.0%}"
                    label_size = cv2.getTextSize(
                        label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2
                    )[0]

                    cv2.rectangle(
                        frame,
                        (x1, y1 - label_size[1] - 15),
                        (x1 + label_size[0] + 10, y1),
                        color, -1
                    )

                    cv2.putText(
                        frame, label, (x1 + 5, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7, (255, 255, 255), 2
                    )

                    objects_detected.append({
                        'class'     : class_name,
                        'confidence': round(confidence * 100, 1),
                        'bbox'      : [x1, y1, x2, y2]
                    })

                    detection_count += 1

        # Add Info Panel
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (frame.shape[1], 60),
                      (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

        cv2.putText(frame, f"Objects Detected: {detection_count}",
                    (15, 40), cv2.FONT_HERSHEY_SIMPLEX,
                    0.9, (50, 220, 100), 2)
        cv2.putText(frame, "CodeAlpha AI",
                    (frame.shape[1] - 200, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8, (180, 130, 255), 2)

        # Convert to Base64
        _, buffer = cv2.imencode('.jpg', frame,
                                [cv2.IMWRITE_JPEG_QUALITY, 90])
        img_base64 = base64.b64encode(buffer).decode('utf-8')

        # Return Results
        return jsonify({
            'success'       : True,
            'image'         : f"data:image/jpeg;base64,{img_base64}",
            'detections'    : objects_detected,
            'total_objects' : detection_count,
            'unique_classes': len(set(d['class'] for d in objects_detected))
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error'  : f'Detection failed: {str(e)}'
        }), 500


# =====================================================
# FLASK ROUTES
# =====================================================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/video_feed')
def video_feed():
    return Response(
        generate_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/start_detection', methods=['POST'])
def start_detection():
    global is_detecting
    is_detecting = True
    return jsonify({'success': True})


@app.route('/stop_detection', methods=['POST'])
def stop_detection():
    global is_detecting, camera
    is_detecting = False
    if camera:
        camera.release()
        camera = None
    return jsonify({'success': True})


@app.route('/stats')
def get_stats():
    return jsonify({
        'success': True,
        'stats'  : detection_stats
    })


@app.route('/reset_stats', methods=['POST'])
def reset_stats():
    global detection_stats
    detection_stats = {
        'total_objects'  : 0,
        'current_objects': 0,
        'fps'            : 0,
        'objects_found'  : {}
    }
    return jsonify({'success': True})


# =====================================================
# RUN APP
# =====================================================
if __name__ == '__main__':
    print("=" * 60)
    print("  🎯 CodeAlpha - Object Detection + Image Upload")
    print("  👨‍💻 Running: detection.py")
    print("  🚀 Server: http://127.0.0.1:5002")
    print("  ✅ YOLOv8 Active | Webcam + Upload Mode")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5002)