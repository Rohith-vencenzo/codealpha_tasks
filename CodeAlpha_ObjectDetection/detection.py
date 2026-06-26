# ================================================================
# CodeAlpha - Object Detection & Tracking
# Task 4 - AI Internship
# Backend: Flask + OpenCV + YOLOv8 + SORT Tracker
# ================================================================

from flask import Flask, render_template, Response, jsonify, request
from flask_cors import CORS
import cv2
import numpy as np
import base64
import time
import os
import threading
from ultralytics import YOLO
from PIL import Image
from scipy.optimize import linear_sum_assignment
from filterpy.kalman import KalmanFilter

# ── Flask App Setup ──────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ── Load YOLOv8 Model ────────────────────────────────────────────
print("[INFO] Loading YOLOv8 model...")
model = YOLO('yolov8n.pt')
print("[INFO] YOLOv8 model loaded successfully!")

# ── Upload Folder Configuration ──────────────────────────────────
UPLOAD_FOLDER      = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    """Check if the uploaded file has an allowed extension."""
    return (
        '.' in filename and
        filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
    )

# ── Global State ─────────────────────────────────────────────────
is_detecting    = False
camera          = None          # Single shared cv2.VideoCapture instance
camera_lock     = threading.Lock()  # Thread-safe camera access

detection_stats = {
    'fps'            : 0,
    'current_objects': 0,
    'total_objects'  : 0,
    'objects_found'  : {}       # { class_name: count }
}

# ── Color Cache for Bounding Boxes ───────────────────────────────
_color_cache = {}

def get_color(class_id: int):
    """Return a consistent BGR color for a given YOLO class ID."""
    if class_id not in _color_cache:
        np.random.seed(class_id + 42)
        _color_cache[class_id] = tuple(
            int(v) for v in np.random.randint(100, 255, 3)
        )
    return _color_cache[class_id]


# ================================================================
# SORT TRACKER IMPLEMENTATION
# ================================================================

def _box_to_z(bbox):
    """Convert [x1,y1,x2,y2] bounding box to SORT measurement vector."""
    w  = bbox[2] - bbox[0]
    h  = bbox[3] - bbox[1]
    cx = bbox[0] + w / 2.0
    cy = bbox[1] + h / 2.0
    s  = float(w * h)                   # area
    r  = w / float(h) if h > 0 else 1.0  # aspect ratio
    return np.array([[cx], [cy], [s], [r]], dtype=np.float32)


def _z_to_box(z):
    """Convert SORT state vector back to [x1,y1,x2,y2] bounding box."""
    cx = float(z[0])
    cy = float(z[1])
    s  = float(z[2])
    r  = float(z[3]) if z[3] > 0 else 1.0
    w  = np.sqrt(s * r)
    h  = s / w if w > 0 else 1.0
    return np.array(
        [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
        dtype=np.float32
    )


def _iou_matrix(detections, trackers):
    """
    Compute IoU matrix between all detection and tracker boxes.
    Returns matrix of shape (num_dets, num_trks).
    """
    matrix = np.zeros((len(detections), len(trackers)), dtype=np.float32)
    for d, det in enumerate(detections):
        for t, trk in enumerate(trackers):
            ix1 = max(det[0], trk[0])
            iy1 = max(det[1], trk[1])
            ix2 = min(det[2], trk[2])
            iy2 = min(det[3], trk[3])
            iw  = max(0.0, ix2 - ix1)
            ih  = max(0.0, iy2 - iy1)
            ia  = iw * ih
            if ia == 0.0:
                continue
            ua = (
                (det[2] - det[0]) * (det[3] - det[1]) +
                (trk[2] - trk[0]) * (trk[3] - trk[1]) - ia
            )
            if ua > 0:
                matrix[d, t] = ia / ua
    return matrix


def _associate_detections(detections, trackers, iou_threshold=0.3):
    """
    Hungarian algorithm assignment of detections to existing trackers.
    Returns (matches, unmatched_detections, unmatched_trackers).
    """
    if len(trackers) == 0:
        return (
            np.empty((0, 2), dtype=int),
            list(range(len(detections))),
            []
        )

    iou_mat       = _iou_matrix(detections, trackers)
    row_idx, col_idx = linear_sum_assignment(-iou_mat)

    matched          = []
    unmatched_dets   = []
    unmatched_trks   = []

    for d in range(len(detections)):
        if d not in row_idx:
            unmatched_dets.append(d)

    for t in range(len(trackers)):
        if t not in col_idx:
            unmatched_trks.append(t)

    for d, t in zip(row_idx, col_idx):
        if iou_mat[d, t] < iou_threshold:
            unmatched_dets.append(d)
            unmatched_trks.append(t)
        else:
            matched.append([d, t])

    return (
        np.array(matched, dtype=int) if matched
        else np.empty((0, 2), dtype=int),
        unmatched_dets,
        unmatched_trks
    )


class KalmanBoxTracker:
    """
    Represents a single tracked object using a Kalman Filter.
    State vector: [cx, cy, area, aspect, vx, vy, va]
    """
    _next_id = 1

    def __init__(self, bbox):
        # Constant velocity Kalman filter (7D state, 4D measurement)
        self.kf = KalmanFilter(dim_x=7, dim_z=4)

        # State transition matrix
        self.kf.F = np.array([
            [1, 0, 0, 0, 1, 0, 0],
            [0, 1, 0, 0, 0, 1, 0],
            [0, 0, 1, 0, 0, 0, 1],
            [0, 0, 0, 1, 0, 0, 0],
            [0, 0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 0, 1],
        ], dtype=np.float32)

        # Measurement function (only cx,cy,area,aspect observed)
        self.kf.H = np.array([
            [1, 0, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0],
            [0, 0, 0, 1, 0, 0, 0],
        ], dtype=np.float32)

        # Measurement noise
        self.kf.R[2:, 2:] *= 10.0
        # Covariance for velocity components (high initial uncertainty)
        self.kf.P[4:, 4:] *= 1000.0
        self.kf.P         *= 10.0
        # Process noise
        self.kf.Q[-1, -1] *= 0.01
        self.kf.Q[4:, 4:] *= 0.01

        # Initialize state from first detection
        self.kf.x[:4] = _box_to_z(bbox[:4])

        # Assign unique tracking ID
        self.id               = KalmanBoxTracker._next_id
        KalmanBoxTracker._next_id += 1

        self.hits             = 1
        self.hit_streak       = 1
        self.age              = 0
        self.time_since_update = 0

    def predict(self):
        """Advance Kalman filter one step and return predicted box."""
        if (self.kf.x[6] + self.kf.x[2]) <= 0:
            self.kf.x[6] = 0.0
        self.kf.predict()
        self.age              += 1
        self.time_since_update += 1
        return _z_to_box(self.kf.x[:4])

    def update(self, bbox):
        """Update Kalman filter with a new matched detection."""
        self.kf.update(_box_to_z(bbox[:4]))
        self.time_since_update = 0
        self.hits             += 1
        self.hit_streak       += 1

    def get_state(self):
        """Return current box estimate [x1,y1,x2,y2]."""
        return _z_to_box(self.kf.x[:4])


class SORTTracker:
    """
    SORT (Simple Online and Realtime Tracking) using Kalman filters
    and Hungarian algorithm for detection-to-track assignment.
    """

    def __init__(self, max_age=30, min_hits=3, iou_threshold=0.3):
        self.max_age       = max_age
        self.min_hits      = min_hits
        self.iou_threshold = iou_threshold
        self.trackers      = []
        self.frame_count   = 0

    def reset(self):
        """Reset tracker state and ID counter."""
        self.trackers    = []
        self.frame_count = 0
        KalmanBoxTracker._next_id = 1

    def update(self, detections: np.ndarray) -> np.ndarray:
        """
        Update tracker with new detections.

        Args:
            detections: np.ndarray of shape (N, 5) → [x1,y1,x2,y2,conf]

        Returns:
            np.ndarray of shape (M, 5) → [x1,y1,x2,y2,track_id]
        """
        self.frame_count += 1

        # Predict new positions for existing trackers; remove invalid ones
        predicted_boxes = []
        bad_indices     = []

        for i, trk in enumerate(self.trackers):
            pred = trk.predict()
            if np.any(np.isnan(pred)):
                bad_indices.append(i)
                predicted_boxes.append(np.zeros(4, dtype=np.float32))
            else:
                predicted_boxes.append(pred)

        for i in sorted(bad_indices, reverse=True):
            self.trackers.pop(i)
            predicted_boxes.pop(i)

        pred_arr = (
            np.array(predicted_boxes, dtype=np.float32)
            if predicted_boxes
            else np.empty((0, 4), dtype=np.float32)
        )
        det_arr = (
            detections[:, :4]
            if len(detections) > 0
            else np.empty((0, 4), dtype=np.float32)
        )

        # Associate detections to existing trackers
        matches, unmatched_dets, unmatched_trks = _associate_detections(
            det_arr, pred_arr, self.iou_threshold
        )

        # Update matched trackers
        for d, t in matches:
            self.trackers[t].update(detections[d])

        # Mark unmatched trackers as having no hit this frame
        for t in unmatched_trks:
            self.trackers[t].hit_streak = 0

        # Create new trackers for unmatched detections
        for d in unmatched_dets:
            self.trackers.append(KalmanBoxTracker(detections[d]))

        # Collect active tracks and prune dead ones
        active_tracks = []
        live_trackers = []

        for trk in self.trackers:
            box = trk.get_state()
            is_confirmed = (
                trk.time_since_update < 1 and
                (
                    trk.hit_streak >= self.min_hits or
                    self.frame_count <= self.min_hits
                )
            )
            if is_confirmed:
                active_tracks.append(
                    np.array(
                        [box[0], box[1], box[2], box[3], trk.id],
                        dtype=np.float32
                    )
                )
            if trk.time_since_update <= self.max_age:
                live_trackers.append(trk)

        self.trackers = live_trackers

        return (
            np.array(active_tracks, dtype=np.float32)
            if active_tracks
            else np.empty((0, 5), dtype=np.float32)
        )


# Shared SORT tracker instance used by the live webcam stream
sort_tracker = SORTTracker(max_age=30, min_hits=3, iou_threshold=0.3)


# ================================================================
# CAMERA MANAGEMENT
# ================================================================

def open_camera():
    """
    Open the default webcam (index 0) using cv2.VideoCapture.
    Sets resolution to 640x480 @ 30 FPS.
    Returns the VideoCapture object or None on failure.
    """
    print("[INFO] Opening camera (index 0)...")
    
    # Try multiple backends for better compatibility
    backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
    cap = None
    
    for backend in backends:
        try:
            cap = cv2.VideoCapture(0, backend)
            if cap.isOpened():
                print(f"[INFO] Camera opened with backend {backend}")
                break
            cap.release()
        except Exception as e:
            print(f"[WARNING] Backend {backend} failed: {e}")
            continue
    
    if cap is None or not cap.isOpened():
        print("[ERROR] Cannot open camera at index 0.")
        return None

    # Configure capture properties
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS,          30)
    cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)

    # Verify we can actually read frames
    for attempt in range(5):
        ok, frame = cap.read()
        if ok and frame is not None and frame.size > 0:
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            print(f"[INFO] Camera opened successfully at {w}x{h}.")
            return cap
        time.sleep(0.1)
    
    print("[ERROR] Camera opened but returned no valid frames.")
    cap.release()
    return None


def release_camera():
    """Release the global camera resource safely."""
    global camera
    with camera_lock:
        if camera is not None:
            try:
                camera.release()
                print("[INFO] Camera released.")
            except Exception as e:
                print(f"[WARNING] Error releasing camera: {e}")
            finally:
                camera = None
        time.sleep(0.3)  # Give OS time to release the resource


# ================================================================
# DETECTION & ANNOTATION
# ================================================================

def run_detection(frame: np.ndarray) -> tuple:
    """
    Run YOLOv8 detection + SORT tracking on a single BGR frame.
    Draws annotated bounding boxes directly on the frame.

    Returns:
        (annotated_frame, objects_found_dict)
    """
    global detection_stats

    t_start = time.time()

    # ── YOLOv8 Inference ────────────────────────────────────────
    try:
        results = model(frame, conf=0.4, verbose=False)
    except Exception as e:
        print(f"[ERROR] YOLO inference failed: {e}")
        return frame, {}
    
    raw_dets     = []          # list of dicts for label lookup
    tracker_input = np.empty((0, 5), dtype=np.float32)
    objects_found = {}
    object_count  = 0

    for result in results:
        if result.boxes is None or len(result.boxes) == 0:
            continue
        
        boxes = result.boxes
        
        for i in range(len(boxes)):
            try:
                # Extract box coordinates - handle both CPU and CUDA tensors
                box_xyxy = boxes.xyxy[i].cpu().numpy() if hasattr(boxes.xyxy[i], 'cpu') else boxes.xyxy[i].numpy()
                x1, y1, x2, y2 = map(float, box_xyxy)
                x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                
                # Extract class ID
                class_id_tensor = boxes.cls[i]
                class_id = int(class_id_tensor.cpu().item() if hasattr(class_id_tensor, 'cpu') else class_id_tensor.item())
                
                # Extract confidence
                conf_tensor = boxes.conf[i]
                confidence = float(conf_tensor.cpu().item() if hasattr(conf_tensor, 'cpu') else conf_tensor.item())
                
                # Get class name
                class_name = model.names[class_id]

                raw_dets.append({
                    'class_id'  : class_id,
                    'class_name': class_name,
                    'confidence': confidence,
                    'bbox'      : [x1, y1, x2, y2]
                })
                
                tracker_input = np.vstack(
                    [tracker_input, [x1, y1, x2, y2, confidence]]
                )
                
                object_count += 1
                objects_found[class_name] = objects_found.get(class_name, 0) + 1
                
            except Exception as e:
                print(f"[WARNING] Failed to process detection {i}: {e}")
                continue

    # ── SORT Tracking ────────────────────────────────────────────
    try:
        tracked = sort_tracker.update(tracker_input)
    except Exception as e:
        print(f"[ERROR] SORT tracking failed: {e}")
        tracked = np.empty((0, 5), dtype=np.float32)

    # ── Annotate Frame ───────────────────────────────────────────
    for track in tracked:
        try:
            x1, y1, x2, y2, track_id = map(int, track[:5])

            # Find the best matching raw detection by IoU
            best_iou  = -1.0
            best_det  = None
            for det in raw_dets:
                dx1, dy1, dx2, dy2 = det['bbox']
                ix1 = max(x1, dx1); iy1 = max(y1, dy1)
                ix2 = min(x2, dx2); iy2 = min(y2, dy2)
                iw  = max(0, ix2 - ix1)
                ih  = max(0, iy2 - iy1)
                ia  = iw * ih
                if ia == 0:
                    continue
                ua  = (x2-x1)*(y2-y1) + (dx2-dx1)*(dy2-dy1) - ia
                iou = ia / ua if ua > 0 else 0.0
                if iou > best_iou:
                    best_iou = iou
                    best_det = det

            class_name = best_det['class_name'] if best_det else 'object'
            confidence = best_det['confidence'] if best_det else 0.0
            class_id   = best_det['class_id']   if best_det else 0
            color      = get_color(class_id)

            # Bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            # Label: "ClassName 98% | ID:3"
            label = f"{class_name} {confidence:.0%} | ID:{track_id}"
            (text_w, text_h), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
            )
            cv2.rectangle(
                frame,
                (x1, y1 - text_h - 12),
                (x1 + text_w + 8, y1),
                color, -1
            )
            cv2.putText(
                frame, label, (x1 + 4, y1 - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2
            )

            # Center dot
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            cv2.circle(frame, (cx, cy), 5, color, -1)
            
        except Exception as e:
            print(f"[WARNING] Failed to draw track: {e}")
            continue

    # ── HUD Overlay ──────────────────────────────────────────────
    fps = 1.0 / (time.time() - t_start + 1e-6)
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (frame.shape[1], 50), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    cv2.putText(frame, f"FPS: {fps:.1f}",
                (10, 33), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 100), 2)
    cv2.putText(frame, f"Objects: {object_count}",
                (160, 33), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 200, 0), 2)
    cv2.putText(frame, f"Tracks: {len(tracked)}",
                (330, 33), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (100, 200, 255), 2)
    cv2.putText(frame, "CodeAlpha AI",
                (frame.shape[1] - 185, 33),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (160, 130, 255), 2)

    # ── Update Global Stats ──────────────────────────────────────
    detection_stats['fps']             = round(fps, 1)
    detection_stats['current_objects'] = object_count
    detection_stats['objects_found']   = objects_found
    detection_stats['total_objects']  += object_count

    return frame, objects_found


# ================================================================
# MJPEG STREAM GENERATOR
# ================================================================

def generate_frames():
    """
    Generator function that yields MJPEG frames for /video_feed.
    Opens the camera, runs detection on each frame, and encodes
    the result as JPEG boundary chunks.
    """
    global is_detecting, camera

    print("[INFO] Stream generator started.")
    
    # Reset tracker
    sort_tracker.reset()

    # Ensure no existing camera is open
    with camera_lock:
        if camera is not None:
            try:
                camera.release()
            except:
                pass
            camera = None
            time.sleep(0.3)

    # Open camera with lock
    with camera_lock:
        camera = open_camera()

    if camera is None:
        # Stream error image
        print("[ERROR] Cannot open camera - streaming error frame")
        error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(error_frame, "CAMERA NOT FOUND",
                    (90, 220), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
        cv2.putText(error_frame, "Check that your webcam is connected",
                    (55, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (200, 200, 200), 2)
        cv2.putText(error_frame, "and not in use by another application",
                    (55, 310), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (200, 200, 200), 2)
        
        _, buf = cv2.imencode('.jpg', error_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        error_chunk = (
            b'--frame\r\nContent-Type: image/jpeg\r\n\r\n'
            + buf.tobytes()
            + b'\r\n'
        )
        
        # Stream error for 30 seconds then stop
        for _ in range(300):
            if not is_detecting:
                break
            yield error_chunk
            time.sleep(0.1)
        
        is_detecting = False
        return

    # Warm-up camera
    print("[INFO] Warming up camera...")
    with camera_lock:
        for _ in range(10):
            camera.read()
    time.sleep(0.3)
    print("[INFO] Streaming frames...")

    consecutive_failures = 0
    frame_count = 0

    try:
        while is_detecting:
            with camera_lock:
                if camera is None:
                    print("[ERROR] Camera became None during streaming")
                    break
                    
                ok, frame = camera.read()

            if not ok or frame is None or frame.size == 0:
                consecutive_failures += 1
                print(f"[WARNING] Frame read failed ({consecutive_failures}/30)")
                
                if consecutive_failures >= 30:
                    print("[ERROR] Too many consecutive read failures. Stopping.")
                    break
                
                time.sleep(0.05)
                continue

            consecutive_failures = 0
            frame_count += 1

            # Mirror the frame horizontally for natural webcam feel
            frame = cv2.flip(frame, 1)

            # Run YOLO + SORT detection and annotation
            try:
                frame, _ = run_detection(frame)
            except Exception as e:
                print(f"[ERROR] Detection failed: {e}")
                # Draw error on frame
                cv2.putText(frame, f"Detection Error: {str(e)[:50]}",
                           (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

            # Encode frame as JPEG
            ret, buffer = cv2.imencode(
                '.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85]
            )
            
            if not ret:
                print("[WARNING] JPEG encoding failed")
                continue

            # Yield frame in MJPEG format
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n'
                + buffer.tobytes()
                + b'\r\n'
            )
            
            # Small delay to prevent overwhelming the browser
            time.sleep(0.01)

    except GeneratorExit:
        print("[INFO] Client disconnected from stream")
    except Exception as e:
        print(f"[ERROR] Stream generator exception: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Always release camera when done
        release_camera()
        is_detecting = False
        print(f"[INFO] Stream generator finished ({frame_count} frames streamed).")


# ================================================================
# FLASK ROUTES
# ================================================================

@app.route('/')
def index():
    """Serve the main HTML page."""
    return render_template('index.html')


@app.route('/video_feed')
def video_feed():
    """
    MJPEG stream endpoint.
    The browser <img> tag points here with a cache-busting timestamp.
    """
    if not is_detecting:
        return jsonify({'error': 'Detection not started'}), 400
    
    return Response(
        generate_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/start_detection', methods=['POST'])
def start_detection():
    """Signal the backend to begin streaming & detection."""
    global is_detecting
    
    if is_detecting:
        return jsonify({
            'success': False, 
            'message': 'Detection already running'
        })
    
    is_detecting = True
    print("[INFO] Detection started.")
    return jsonify({'success': True, 'message': 'Detection started'})


@app.route('/stop_detection', methods=['POST'])
def stop_detection():
    """Signal the backend to stop streaming & release the camera."""
    global is_detecting
    
    is_detecting = False
    
    # Give the generator time to stop and release camera
    time.sleep(0.5)
    
    # Force release if still open
    release_camera()
    
    print("[INFO] Detection stopped.")
    return jsonify({'success': True, 'message': 'Detection stopped'})


@app.route('/stats')
def get_stats():
    """Return the current detection statistics as JSON."""
    return jsonify({'success': True, 'stats': detection_stats})


@app.route('/reset_stats', methods=['POST'])
def reset_stats():
    """Reset all detection statistics to zero."""
    global detection_stats
    detection_stats = {
        'fps'            : 0,
        'current_objects': 0,
        'total_objects'  : 0,
        'objects_found'  : {}
    }
    print("[INFO] Stats reset.")
    return jsonify({'success': True, 'message': 'Stats reset'})


@app.route('/upload_image', methods=['POST'])
def upload_image():
    """
    Accepts an image upload, runs YOLOv8 + SORT detection,
    annotates the image, and returns a Base64-encoded JPEG
    alongside structured detection data.
    """
    try:
        # ── Validate request ────────────────────────────────────
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file in request'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Empty filename'}), 400
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'File type not allowed'}), 400

        # ── Load image ──────────────────────────────────────────
        pil_img = Image.open(file.stream).convert('RGB')
        arr     = np.array(pil_img)
        frame   = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

        # ── YOLOv8 Inference ────────────────────────────────────
        results      = model(frame, conf=0.3, verbose=False)
        raw_dets     = []
        tracker_input = np.empty((0, 5), dtype=np.float32)

        for result in results:
            if result.boxes is None or len(result.boxes) == 0:
                continue
            
            boxes = result.boxes
            
            for i in range(len(boxes)):
                try:
                    # Extract box coordinates safely
                    box_xyxy = boxes.xyxy[i].cpu().numpy() if hasattr(boxes.xyxy[i], 'cpu') else boxes.xyxy[i].numpy()
                    x1, y1, x2, y2 = map(float, box_xyxy)
                    x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                    
                    # Extract class ID
                    class_id_tensor = boxes.cls[i]
                    class_id = int(class_id_tensor.cpu().item() if hasattr(class_id_tensor, 'cpu') else class_id_tensor.item())
                    
                    # Extract confidence
                    conf_tensor = boxes.conf[i]
                    confidence = float(conf_tensor.cpu().item() if hasattr(conf_tensor, 'cpu') else conf_tensor.item())
                    
                    class_name = model.names[class_id]
                    
                    raw_dets.append({
                        'class_id'  : class_id,
                        'class_name': class_name,
                        'confidence': confidence,
                        'bbox'      : [x1, y1, x2, y2]
                    })
                    tracker_input = np.vstack(
                        [tracker_input, [x1, y1, x2, y2, confidence]]
                    )
                except Exception as e:
                    print(f"[WARNING] Failed to process upload detection {i}: {e}")
                    continue

        # ── SORT Tracking (fresh instance per upload) ───────────
        upload_tracker = SORTTracker(
            max_age=30, min_hits=1, iou_threshold=0.3
        )
        tracked = upload_tracker.update(tracker_input)

        # ── Annotate & build response ────────────────────────────
        detections_out = []

        for track in tracked:
            x1, y1, x2, y2, track_id = map(int, track[:5])

            # Match to best raw detection by IoU
            best_iou = -1.0
            best_det = None
            for det in raw_dets:
                dx1, dy1, dx2, dy2 = det['bbox']
                ix1 = max(x1, dx1); iy1 = max(y1, dy1)
                ix2 = min(x2, dx2); iy2 = min(y2, dy2)
                iw  = max(0, ix2 - ix1)
                ih  = max(0, iy2 - iy1)
                ia  = iw * ih
                if ia == 0:
                    continue
                ua  = (x2-x1)*(y2-y1) + (dx2-dx1)*(dy2-dy1) - ia
                iou = ia / ua if ua > 0 else 0.0
                if iou > best_iou:
                    best_iou = iou
                    best_det = det

            class_name = best_det['class_name'] if best_det else 'object'
            confidence = best_det['confidence'] if best_det else 0.0
            class_id   = best_det['class_id']   if best_det else 0
            color      = get_color(class_id)

            # Draw thicker boxes for upload images
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)

            label = f"{class_name} {confidence:.0%} | ID:{track_id}"
            (text_w, text_h), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2
            )
            cv2.rectangle(
                frame,
                (x1, y1 - text_h - 15),
                (x1 + text_w + 10, y1),
                color, -1
            )
            cv2.putText(
                frame, label, (x1 + 5, y1 - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2
            )

            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            cv2.circle(frame, (cx, cy), 6, color, -1)

            detections_out.append({
                'class'     : class_name,
                'confidence': round(confidence * 100, 1),
                'bbox'      : [x1, y1, x2, y2],
                'track_id'  : track_id
            })

        # Watermark overlay on upload result
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (frame.shape[1], 55), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)
        cv2.putText(
            frame, f"Objects: {len(detections_out)}",
            (15, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (50, 220, 100), 2
        )
        cv2.putText(
            frame, "CodeAlpha AI",
            (frame.shape[1] - 200, 38),
            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (180, 130, 255), 2
        )

        # Encode annotated frame to Base64 JPEG
        _, buf     = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        img_base64 = base64.b64encode(buf).decode('utf-8')

        unique_classes = len(set(d['class'] for d in detections_out))

        return jsonify({
            'success'       : True,
            'image'         : f'data:image/jpeg;base64,{img_base64}',
            'detections'    : detections_out,
            'total_objects' : len(detections_out),
            'unique_classes': unique_classes
        })

    except Exception as exc:
        print(f"[ERROR] upload_image: {exc}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(exc)}), 500


# ================================================================
# ENTRY POINT
# ================================================================

if __name__ == '__main__':
    print("=" * 60)
    print("  CodeAlpha — Object Detection & Tracking  |  Task 4")
    print("  URL: http://127.0.0.1:5002")
    print("=" * 60)
    app.run(
        debug       = False,
        use_reloader= False,
        threaded    = True,
        host        = '0.0.0.0',
        port        = 5002
    )
