// ================================================================
// CodeAlpha — Object Detection & Tracking
// Task 4 — AI Internship
// Single JavaScript file — NO inline JS, NO duplicate functions
// ================================================================

'use strict';

// ================================================================
// DOM REFERENCES
// All IDs match exactly with index.html — verified line by line
// ================================================================

// ── Mode Tabs ────────────────────────────// ═══════════════════════════════════════════════
//  CodeAlpha - Object Detection Full JavaScript
// ═══════════════════════════════════════════════

'use strict';

// ─── DOM References — Webcam Mode ─────────────
const startBtn         = document.getElementById('startBtn');
const stopBtn          = document.getElementById('stopBtn');
const resetBtn         = document.getElementById('resetBtn');
const videoFeed        = document.getElementById('videoFeed');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const fpsDisplay       = document.getElementById('fpsDisplay');
const objectsDisplay   = document.getElementById('objectsDisplay');
const currentObjects   = document.getElementById('currentObjects');
const currentFPS       = document.getElementById('currentFPS');
const totalObjects     = document.getElementById('totalObjects');
const uniqueObjects    = document.getElementById('uniqueObjects');
const objectsList      = document.getElementById('objectsList');

// ─── DOM References — Upload Mode ─────────────
const webcamTab          = document.getElementById('webcamTab');
const uploadTab          = document.getElementById('uploadTab');
const webcamMode         = document.getElementById('webcamMode');
const uploadMode         = document.getElementById('uploadMode');
const imageInput         = document.getElementById('imageInput');
const browseBtn          = document.getElementById('browseBtn');
const uploadArea         = document.getElementById('uploadArea');
const resultImage        = document.getElementById('resultImage');
const detectImageBtn     = document.getElementById('detectImageBtn');
const clearImageBtn      = document.getElementById('clearImageBtn');
const uploadResults      = document.getElementById('uploadResults');
const uploadObjectsList  = document.getElementById('uploadObjectsList');

// ─── State ────────────────────────────────────
let statsInterval = null;
let isDetecting   = false;
let selectedFile  = null;

// ─── Colors for objects ────────────────────────
const objectColors = [
    '#6C63FF','#FF6584','#43E97B','#FFD700',
    '#FF6B6B','#4ECDC4','#45B7D1','#96CEB4',
    '#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F'
];

function getObjectColor(name) {
    let hash = 0;
    for (let c of name) hash += c.charCodeAt(0);
    return objectColors[hash % objectColors.length];
}


// ═══════════════════════════════════════════════
//  WEBCAM MODE FUNCTIONS
// ═══════════════════════════════════════════════

// ─── Start Detection ───────────────────────────
async function startDetection() {
    try {
        const response = await fetch('/start_detection', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            isDetecting = true;

            // Show video feed
            videoPlaceholder.style.display = 'none';
            videoFeed.style.display        = 'block';
            videoFeed.src = '/video_feed?' + Date.now();

            // Update buttons
            startBtn.disabled  = true;
            stopBtn.disabled   = false;
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';

            // Start stats update
            statsInterval = setInterval(updateStats, 1000);
        }

    } catch (error) {
        console.error('Start Error:', error);
        alert('Failed to start detection. Make sure webcam is connected!');
    }
}

// ─── Stop Detection ────────────────────────────
async function stopDetection() {
    try {
        const response = await fetch('/stop_detection', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            isDetecting = false;

            // Hide video feed
            videoFeed.style.display        = 'none';
            videoFeed.src                  = '';
            videoPlaceholder.style.display = 'flex';

            // Update buttons
            startBtn.disabled  = false;
            stopBtn.disabled   = true;
            startBtn.innerHTML = '<i class="fas fa-play"></i> Start Detection';

            // Stop stats update
            if (statsInterval) {
                clearInterval(statsInterval);
                statsInterval = null;
            }

            // Reset displays
            fpsDisplay.textContent     = '0';
            objectsDisplay.textContent = '0';
        }

    } catch (error) {
        console.error('Stop Error:', error);
    }
}

// ─── Update Stats ──────────────────────────────
async function updateStats() {
    if (!isDetecting) return;

    try {
        const response = await fetch('/stats');
        const data     = await response.json();

        if (data.success) {
            const stats = data.stats;

            // Update displays
            fpsDisplay.textContent     = stats.fps;
            objectsDisplay.textContent = stats.current_objects;
            currentObjects.textContent = stats.current_objects;
            currentFPS.textContent     = stats.fps;
            totalObjects.textContent   = stats.total_objects;
            uniqueObjects.textContent  = Object.keys(
                stats.objects_found
            ).length;

            // Update objects list
            renderObjectsList(stats.objects_found);
        }

    } catch (error) {
        console.error('Stats Error:', error);
    }
}

// ─── Render Objects List ───────────────────────
function renderObjectsList(objects) {
    if (Object.keys(objects).length === 0) {
        objectsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No objects detected</p>
                <span>Point camera at objects</span>
            </div>`;
        return;
    }

    const sorted = Object.entries(objects)
        .sort((a, b) => b[1] - a[1]);

    objectsList.innerHTML = '';

    sorted.forEach(([name, count]) => {
        const color = getObjectColor(name);
        const item  = document.createElement('div');
        item.className = 'object-item';
        item.innerHTML = `
            <div class="object-name">
                <div class="object-dot"
                     style="background:${color}"></div>
                ${name}
            </div>
            <span class="object-count">${count}</span>`;
        objectsList.appendChild(item);
    });
}

// ─── Reset Stats ───────────────────────────────
async function resetStats() {
    try {
        await fetch('/reset_stats', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        totalObjects.textContent   = '0';
        uniqueObjects.textContent  = '0';
        currentObjects.textContent = '0';
        currentFPS.textContent     = '0';

        objectsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>Stats reset!</p>
                <span>Detection continuing...</span>
            </div>`;

    } catch (error) {
        console.error('Reset Error:', error);
    }
}


// ═══════════════════════════════════════════════
//  MODE SWITCHING
// ═══════════════════════════════════════════════
webcamTab.addEventListener('click', () => {
    webcamTab.classList.add('active');
    uploadTab.classList.remove('active');
    webcamMode.style.display = 'block';
    uploadMode.style.display = 'none';
});

uploadTab.addEventListener('click', () => {
    uploadTab.classList.add('active');
    webcamTab.classList.remove('active');
    webcamMode.style.display = 'none';
    uploadMode.style.display = 'block';

    // Stop webcam if running
    if (isDetecting) {
        stopDetection();
    }
});


// ═══════════════════════════════════════════════
//  UPLOAD MODE FUNCTIONS
// ═══════════════════════════════════════════════

// ─── Browse Button ─────────────────────────────
browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    imageInput.click();
});

// ─── Upload Area Click ─────────────────────────
uploadArea.addEventListener('click', () => {
    imageInput.click();
});

// ─── File Input Change ─────────────────────────
imageInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
    }
});

// ─── Drag & Drop ───────────────────────────────
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

// ─── Handle File Selection ─────────────────────
function handleFileSelect(file) {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file! (JPG, PNG, GIF)');
        return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
        alert('File is too large! Maximum size is 10MB');
        return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();

    reader.onload = (e) => {
        // Hide upload area
        uploadArea.style.display  = 'none';

        // Show image preview
        resultImage.src           = e.target.result;
        resultImage.style.display = 'block';

        // Enable detect button
        detectImageBtn.disabled   = false;

        // Hide previous results
        uploadResults.style.display = 'none';
    };

    reader.readAsDataURL(file);
}

// ─── Detect Objects in Image ───────────────────
detectImageBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    // Show loading state
    detectImageBtn.disabled = true;
    detectImageBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Detecting...';

    try {
        // Create form data with file
        const formData = new FormData();
        formData.append('file', selectedFile);

        // Send to server
        const response = await fetch('/upload_image', {
            method: 'POST',
            body  : formData
        });

        const data = await response.json();

        if (data.success) {
            // Show annotated image (with bounding boxes)
            resultImage.src = data.image;

            // Show detection results panel
            displayUploadResults(data);

            // Update stats panel
            currentObjects.textContent = data.total_objects;
            totalObjects.textContent   = data.total_objects;
            uniqueObjects.textContent  = data.unique_classes;

        } else {
            alert('Detection failed: ' + data.error);
        }

    } catch (error) {
        console.error('Upload Detection Error:', error);
        alert('Something went wrong. Please try again!');
    }

    // Restore button
    detectImageBtn.disabled = false;
    detectImageBtn.innerHTML =
        '<i class="fas fa-search"></i> Detect Objects';
});

// ─── Display Upload Results ────────────────────
function displayUploadResults(data) {
    uploadResults.style.display = 'block';
    uploadObjectsList.innerHTML = '';

    if (data.detections.length === 0) {
        uploadObjectsList.innerHTML = `
            <div style="
                text-align : center;
                padding    : 20px;
                color      : var(--text-muted);
            ">
                <i class="fas fa-search"
                   style="font-size:1.5rem; display:block; margin-bottom:8px;">
                </i>
                <p>No objects detected</p>
                <span style="font-size:0.8rem;">
                    Try a different image or adjust lighting
                </span>
            </div>`;
        return;
    }

    // Group detections by class
    const grouped = {};
    data.detections.forEach(det => {
        if (!grouped[det.class]) {
            grouped[det.class] = {
                count  : 0,
                totalConf: 0
            };
        }
        grouped[det.class].count++;
        grouped[det.class].totalConf += det.confidence;
    });

    // Render each detected class
    Object.keys(grouped).forEach(className => {
        const info    = grouped[className];
        const avgConf = info.totalConf / info.count;
        const color   = getObjectColor(className);

        const item = document.createElement('div');
        item.className = 'upload-object-item';
        item.innerHTML = `
            <div class="upload-object-name">
                <div class="object-dot"
                     style="background:${color}; width:10px; height:10px; border-radius:50%;">
                </div>
                ${className}
                ${info.count > 1
                    ? `<span style="
                        font-size:0.7rem;
                        color:var(--text-muted);
                        ">
                        (${info.count} found)
                       </span>`
                    : ''
                }
            </div>
            <span class="upload-object-confidence">
                ${avgConf.toFixed(1)}%
            </span>`;

        uploadObjectsList.appendChild(item);
    });
}

// ─── Clear Image ───────────────────────────────
clearImageBtn.addEventListener('click', () => {
    // Reset file
    selectedFile      = null;
    imageInput.value  = '';

    // Hide result image
    resultImage.style.display = 'none';
    resultImage.src           = '';

    // Show upload area again
    uploadArea.style.display  = 'flex';

    // Disable detect button
    detectImageBtn.disabled   = true;

    // Hide results
    uploadResults.style.display = 'none';
    uploadObjectsList.innerHTML = '';

    // Reset stats
    currentObjects.textContent = '0';
    totalObjects.textContent   = '0';
    uniqueObjects.textContent  = '0';
});


// ═══════════════════════════════════════════════
//  VIDEO FEED ERROR HANDLER
// ═══════════════════════════════════════════════
videoFeed.addEventListener('error', () => {
    if (isDetecting) {
        setTimeout(() => {
            videoFeed.src = '/video_feed?' + Date.now();
        }, 1000);
    }
});


// ═══════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════
startBtn.addEventListener('click', startDetection);
stopBtn.addEventListener('click',  stopDetection);
resetBtn.addEventListener('click', resetStats);


// ═══════════════════════════════════════════════
//  INITIALIZE
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    console.log(
        '%c 🎯 CodeAlpha Object Detection Loaded!',
        'color: #6C63FF; font-size: 16px; font-weight: bold;'
    );
});────────────────────────
const webcamTab = document.getElementById('webcamTab');
const uploadTab = document.getElementById('uploadTab');
const webcamMode = document.getElementById('webcamMode');
const uploadMode = document.getElementById('uploadMode');

// ── Webcam Panel ─────────────────────────────────────────────────
const startBtn         = document.getElementById('startBtn');
const stopBtn          = document.getElementById('stopBtn');
const resetBtn         = document.getElementById('resetBtn');
const videoFeed        = document.getElementById('videoFeed');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const fpsDisplay       = document.getElementById('fpsDisplay');
const objectsDisplay   = document.getElementById('objectsDisplay');

// ── Statistics Sidebar ────────────────────────────────────────────
const currentFPS     = document.getElementById('currentFPS');
const currentObjects = document.getElementById('currentObjects');
const totalObjects   = document.getElementById('totalObjects');
const uniqueObjects  = document.getElementById('uniqueObjects');
const objectsList    = document.getElementById('objectsList');

// ── Upload Panel ──────────────────────────────────────────────────
const browseBtn         = document.getElementById('browseBtn');
const uploadArea        = document.getElementById('uploadArea');
const imageInput        = document.getElementById('imageInput');
const resultImage       = document.getElementById('resultImage');
const detectImageBtn    = document.getElementById('detectImageBtn');
const clearImageBtn     = document.getElementById('clearImageBtn');
const uploadResults     = document.getElementById('uploadResults');
const uploadObjectsList = document.getElementById('uploadObjectsList');

// ================================================================
// APPLICATION STATE
// One single source of truth — no globals elsewhere
// ================================================================
const state = {
  isDetecting  : false,   // true while webcam stream is active
  statsInterval: null,    // setInterval handle for stats polling
  selectedFile : null     // File object chosen for upload
};

// ================================================================
// COLOUR PALETTE
// Deterministic colour per class name for object list dots
// ================================================================
const PALETTE = [
  '#6C63FF', '#FF6584', '#43E97B', '#FFD700',
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
];

/**
 * Return a consistent colour string for a given object class name.
 * Uses a simple character-code hash so the same name always maps
 * to the same colour.
 *
 * @param   {string} name - YOLO class name (e.g. "person")
 * @returns {string}        CSS colour string
 */
function getObjectColour(name) {
  let hash = 0;
  for (const ch of name) {
    hash += ch.charCodeAt(0);
  }
  return PALETTE[hash % PALETTE.length];
}

// ================================================================
// WEBCAM MODE — START DETECTION
// ================================================================

/**
 * Tell the backend to start detection, then point the <img> src
 * at /video_feed with a cache-busting timestamp.
 * Only called once — duplicate calls are blocked by state.isDetecting.
 */
async function startDetection() {
  if (state.isDetecting) return;

  // Disable start button immediately to prevent double-clicks
  startBtn.disabled  = true;
  startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting…';

  try {
    const response = await fetch('/start_detection', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (!data.success) {
      console.error('[Detection] Backend returned success:false');
      resetStartButton();
      return;
    }

    // ── Mark as detecting ───────────────────────────────────────
    state.isDetecting = true;

    // ── Show MJPEG stream ───────────────────────────────────────
    // Timestamp prevents the browser from serving a stale cached image
    videoFeed.src          = '/video_feed?' + Date.now();
    videoFeed.style.display = 'block';

    // Hide the camera-off placeholder
    videoPlaceholder.style.display = 'none';

    // ── Update button states ─────────────────────────────────────
    startBtn.disabled  = true;
    startBtn.innerHTML = '<i class="fas fa-circle fa-beat"></i> Detecting…';
    stopBtn.disabled   = false;

    // ── Begin polling detection statistics every second ──────────
    state.statsInterval = setInterval(fetchStats, 1000);

  } catch (err) {
    console.error('[Detection] startDetection error:', err);
    alert('Could not connect to the server.\nMake sure detection.py is running.');
    resetStartButton();
  }
}

/** Restore the Start button to its idle appearance. */
function resetStartButton() {
  startBtn.disabled  = false;
  startBtn.innerHTML = '<i class="fas fa-play"></i> Start Detection';
}

// ================================================================
// WEBCAM MODE — STOP DETECTION
// ================================================================

/**
 * Tell the backend to stop, clear the stream, and return the UI
 * to its idle state.
 */
async function stopDetection() {
  if (!state.isDetecting) return;

  state.isDetecting = false;

  // ── Stop stats polling ──────────────────────────────────────
  clearInterval(state.statsInterval);
  state.statsInterval = null;

  // ── Tear down the MJPEG stream ──────────────────────────────
  // Setting src='' makes the browser abort the ongoing HTTP request
  videoFeed.src          = '';
  videoFeed.style.display = 'none';

  // Show the camera-off placeholder again
  videoPlaceholder.style.display = 'flex';

  // ── Restore buttons ─────────────────────────────────────────
  resetStartButton();
  stopBtn.disabled = true;

  // ── Reset the header HUD counters ───────────────────────────
  fpsDisplay.textContent     = '0';
  objectsDisplay.textContent = '0';

  // ── Notify backend to release the camera ────────────────────
  try {
    await fetch('/stop_detection', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[Detection] stopDetection error:', err);
  }
}

// ================================================================
// STATISTICS POLLING
// ================================================================

/**
 * Fetch /stats from the Flask backend and update every counter
 * element in the sidebar and the video header bar.
 * Called every second while detection is running.
 */
async function fetchStats() {
  if (!state.isDetecting) return;

  try {
    const response = await fetch('/stats');
    const data     = await response.json();

    if (!data.success) return;

    const stats = data.stats;

    // ── Video header HUD ────────────────────────────────────────
    fpsDisplay.textContent     = stats.fps       ?? 0;
    objectsDisplay.textContent = stats.current_objects ?? 0;

    // ── Sidebar statistics boxes ────────────────────────────────
    currentFPS.textContent     = stats.fps             ?? 0;
    currentObjects.textContent = stats.current_objects ?? 0;
    totalObjects.textContent   = stats.total_objects   ?? 0;
    uniqueObjects.textContent  = Object.keys(stats.objects_found ?? {}).length;

    // ── Detected objects list ────────────────────────────────────
    renderObjectsList(stats.objects_found ?? {});

  } catch (err) {
    // Network hiccup — silently ignore; retry next interval
    console.warn('[Stats] Fetch failed:', err.message);
  }
}

// ================================================================
// RENDER DETECTED OBJECTS LIST
// ================================================================

/**
 * Populate the #objectsList element with one row per detected class.
 * Sorted descending by count so the most frequent class is at the top.
 *
 * @param {Object} objectsFound - { class_name: count, … }
 */
function renderObjectsList(objectsFound) {
  const entries = Object.entries(objectsFound);

  if (entries.length === 0) {
    objectsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <p>No objects detected</p>
        <span>Point the camera at objects</span>
      </div>`;
    return;
  }

  // Sort by count descending
  entries.sort((a, b) => b[1] - a[1]);

  objectsList.innerHTML = '';

  entries.forEach(([name, count]) => {
    const colour = getObjectColour(name);
    const item   = document.createElement('div');
    item.className = 'object-item';
    item.innerHTML = `
      <div class="object-name">
        <div class="object-dot" style="background: ${colour};"></div>
        ${name}
      </div>
      <span class="object-count">${count}</span>`;
    objectsList.appendChild(item);
  });
}

// ================================================================
// RESET STATISTICS
// ================================================================

/**
 * Ask the backend to zero out all stats, then immediately clear
 * every counter element in the UI so the user sees the reset at once.
 */
async function resetStats() {
  try {
    await fetch('/reset_stats', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[Stats] resetStats error:', err);
  }

  // Clear sidebar counters
  currentFPS.textContent     = '0';
  currentObjects.textContent = '0';
  totalObjects.textContent   = '0';
  uniqueObjects.textContent  = '0';

  // Clear header HUD
  fpsDisplay.textContent     = '0';
  objectsDisplay.textContent = '0';

  // Clear objects list
  objectsList.innerHTML = `
    <div class="empty-state">
      <i class="fas fa-redo"></i>
      <p>Statistics reset</p>
      <span>Detection continuing…</span>
    </div>`;
}

// ================================================================
// VIDEO FEED — ERROR RECOVERY
// ================================================================

/**
 * If the MJPEG stream <img> fires an error (e.g. camera dropped),
 * attempt to reconnect once per second while detection is still on.
 */
videoFeed.addEventListener('error', () => {
  if (state.isDetecting) {
    console.warn('[Stream] MJPEG error — retrying in 1 s…');
    setTimeout(() => {
      if (state.isDetecting) {
        // Fresh timestamp forces a new HTTP request, bypassing cache
        videoFeed.src = '/video_feed?' + Date.now();
      }
    }, 1000);
  }
});

// ================================================================
// MODE SWITCHING — TABS
// ================================================================

/**
 * Switch to Webcam mode.
 * Activates the webcamTab button and shows the webcamMode panel.
 */
webcamTab.addEventListener('click', () => {
  // Update tab button appearance
  webcamTab.classList.add('active');
  uploadTab.classList.remove('active');

  webcamTab.setAttribute('aria-selected', 'true');
  uploadTab.setAttribute('aria-selected', 'false');

  // Show/hide panels
  webcamMode.style.display = 'flex';   // video-card uses flex column
  uploadMode.style.display = 'none';
});

/**
 * Switch to Upload mode.
 * Stops any active webcam stream before switching panels.
 */
uploadTab.addEventListener('click', () => {
  // If webcam is running, stop it cleanly before leaving
  if (state.isDetecting) {
    stopDetection();
  }

  // Update tab button appearance
  uploadTab.classList.add('active');
  webcamTab.classList.remove('active');

  uploadTab.setAttribute('aria-selected', 'true');
  webcamTab.setAttribute('aria-selected', 'false');

  // Show/hide panels
  uploadMode.style.display = 'flex';
  webcamMode.style.display = 'none';
});

// ================================================================
// UPLOAD MODE — FILE SELECTION
// ================================================================

/**
 * Open the native file picker when the Browse button is clicked.
 * stopPropagation prevents the click from also bubbling to uploadArea.
 */
browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  imageInput.click();
});

/**
 * Open the file picker when anywhere in the drop zone is clicked.
 */
uploadArea.addEventListener('click', () => {
  imageInput.click();
});

/**
 * React to the user choosing a file via the native file picker.
 */
imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFileSelect(file);
});

// ── Drag and Drop ──────────────────────────────────────────────────
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

/**
 * Validate a selected/dropped file and show a preview.
 * Enables the Detect button only after a valid image is ready.
 *
 * @param {File} file
 */
function handleFileSelect(file) {
  // ── Type validation ────────────────────────────────────────────
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png',
                      'image/bmp', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    alert('Please select a valid image file (JPG, PNG, BMP, GIF).');
    return;
  }

  // ── Size validation (10 MB limit) ─────────────────────────────
  if (file.size > 10 * 1024 * 1024) {
    alert('File is too large. Maximum allowed size is 10 MB.');
    return;
  }

  state.selectedFile = file;

  // Show a local preview before the file is sent to the server
  const reader    = new FileReader();
  reader.onload   = (e) => {
    // Hide the drop zone, show the preview image
    uploadArea.style.display   = 'none';
    resultImage.src            = e.target.result;
    resultImage.style.display  = 'block';

    // Enable the detect button
    detectImageBtn.disabled    = false;

    // Hide any previous detection results
    uploadResults.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// ================================================================
// UPLOAD MODE — DETECT OBJECTS IN IMAGE
// ================================================================

detectImageBtn.addEventListener('click', async () => {
  if (!state.selectedFile) return;

  // ── Loading state ──────────────────────────────────────────────
  detectImageBtn.disabled  = true;
  detectImageBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Detecting…';

  const formData = new FormData();
  formData.append('file', state.selectedFile);

  try {
    const response = await fetch('/upload_image', {
      method: 'POST',
      body  : formData
    });

    const data = await response.json();

    if (data.success) {
      // Replace preview with the annotated result image (Base64 JPEG)
      resultImage.src = data.image;

      // Populate the results panel below the image
      renderUploadResults(data);

      // Also update the sidebar stats so numbers are consistent
      currentObjects.textContent = data.total_objects;
      totalObjects.textContent   = data.total_objects;
      uniqueObjects.textContent  = data.unique_classes;

    } else {
      alert('Detection failed: ' + (data.error || 'Unknown error'));
    }

  } catch (err) {
    console.error('[Upload] detectImage error:', err);
    alert('Something went wrong during upload. Please try again.');
  }

  // ── Restore button ─────────────────────────────────────────────
  detectImageBtn.disabled  = false;
  detectImageBtn.innerHTML = '<i class="fas fa-search"></i> Detect Objects';
});

// ================================================================
// UPLOAD MODE — RENDER DETECTION RESULTS
// ================================================================

/**
 * Show the upload results panel and populate it with one row
 * per detected class (grouped, with average confidence).
 *
 * @param {Object} data - JSON response from /upload_image
 */
function renderUploadResults(data) {
  uploadResults.style.display = 'block';
  uploadObjectsList.innerHTML = '';

  const detections = data.detections || [];

  if (detections.length === 0) {
    uploadObjectsList.innerHTML = `
      <div style="text-align:center; padding:20px; color:var(--text-muted);">
        <i class="fas fa-search"
           style="font-size:1.6rem; display:block; margin-bottom:10px; opacity:0.4;">
        </i>
        <p>No objects detected</p>
        <span style="font-size:0.78rem;">
          Try a different image or adjust lighting
        </span>
      </div>`;
    return;
  }

  // Group detections by class name to show count + average confidence
  const grouped = {};
  detections.forEach((det) => {
    if (!grouped[det.class]) {
      grouped[det.class] = { count: 0, totalConf: 0 };
    }
    grouped[det.class].count++;
    grouped[det.class].totalConf += det.confidence;
  });

  // Render each class group
  Object.entries(grouped)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([className, info]) => {
      const avgConf = (info.totalConf / info.count).toFixed(1);
      const colour  = getObjectColour(className);

      const item = document.createElement('div');
      item.className = 'upload-object-item';
      item.innerHTML = `
        <div class="upload-object-name">
          <div class="object-dot"
               style="background:${colour}; width:9px; height:9px; border-radius:50%;">
          </div>
          ${className}
          ${info.count > 1
            ? `<span style="font-size:0.70rem; color:var(--text-muted);">
                 (${info.count})
               </span>`
            : ''
          }
        </div>
        <span class="upload-object-confidence">${avgConf}%</span>`;

      uploadObjectsList.appendChild(item);
    });
}

// ================================================================
// UPLOAD MODE — CLEAR IMAGE
// ================================================================

clearImageBtn.addEventListener('click', () => {
  // Reset file state
  state.selectedFile  = null;
  imageInput.value    = '';

  // Hide result image, show upload area again
  resultImage.src            = '';
  resultImage.style.display  = 'none';
  uploadArea.style.display   = 'flex';

  // Disable detect button until a new file is chosen
  detectImageBtn.disabled    = true;

  // Hide and clear results panel
  uploadResults.style.display  = 'none';
  uploadObjectsList.innerHTML  = '';

  // Reset sidebar counters that were set from upload results
  currentObjects.textContent = '0';
  totalObjects.textContent   = '0';
  uniqueObjects.textContent  = '0';
});

// ================================================================
// WEBCAM BUTTON EVENT LISTENERS
// All three use addEventListener — NO onclick attributes in HTML
// ================================================================
startBtn.addEventListener('click', startDetection);
stopBtn.addEventListener('click',  stopDetection);
resetBtn.addEventListener('click', resetStats);

// ================================================================
// INITIALISATION
// Runs once the DOM is fully parsed
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Confirm the app loaded cleanly
  console.log(
    '%c 🎯 CodeAlpha Object Detection Ready!',
    'color:#6C63FF; font-size:15px; font-weight:bold;'
  );

  // Ensure button initial states are correct
  stopBtn.disabled        = true;
  detectImageBtn.disabled = true;

  // Ensure only webcam tab is active on first load
  webcamMode.style.display = 'flex';
  uploadMode.style.display = 'none';
});
