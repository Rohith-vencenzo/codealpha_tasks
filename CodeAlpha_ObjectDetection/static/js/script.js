// ═══════════════════════════════════════════════
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
});