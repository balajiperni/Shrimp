/**
 * Shrimp Count Detector — Frontend Application
 * Handles image upload, detection API calls, and result display
 */

// ─── DOM Elements ────────────────────────────────────────────────────────────

const elements = {
    uploadArea: document.getElementById('uploadArea'),
    uploadContent: document.getElementById('uploadContent'),
    uploadPreview: document.getElementById('uploadPreview'),
    previewImage: document.getElementById('previewImage'),
    changeImageBtn: document.getElementById('changeImageBtn'),
    fileInput: document.getElementById('fileInput'),
    confidenceSlider: document.getElementById('confidenceSlider'),
    confidenceValue: document.getElementById('confidenceValue'),
    detectBtn: document.getElementById('detectBtn'),
    btnContent: document.getElementById('btnContent'),
    btnLoading: document.getElementById('btnLoading'),
    resultPlaceholder: document.getElementById('resultPlaceholder'),
    resultContent: document.getElementById('resultContent'),
    shrimpCount: document.getElementById('shrimpCount'),
    avgConfidence: document.getElementById('avgConfidence'),
    processingTime: document.getElementById('processingTime'),
    annotatedImage: document.getElementById('annotatedImage'),
    detectionsBody: document.getElementById('detectionsBody'),
    downloadBtn: document.getElementById('downloadBtn'),
    toast: document.getElementById('toast'),
    toastIcon: document.getElementById('toastIcon'),
    toastMessage: document.getElementById('toastMessage'),
};

// ─── State ───────────────────────────────────────────────────────────────────

let selectedFile = null;
let currentResultImageUrl = null;

// ─── Upload Handling ─────────────────────────────────────────────────────────

// Click to upload
elements.uploadArea.addEventListener('click', (e) => {
    if (e.target === elements.changeImageBtn || elements.changeImageBtn.contains(e.target)) {
        elements.fileInput.click();
        return;
    }
    if (!selectedFile) {
        elements.fileInput.click();
    }
});

elements.changeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.fileInput.click();
});

// File selected
elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelect(file);
});

// Drag and drop
elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('dragover');
});

elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('dragover');
});

elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
});

function handleFileSelect(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showToast('error', 'Invalid file type. Please upload JPG, PNG, BMP, or WebP images.');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showToast('error', 'File too large. Maximum size is 10 MB.');
        return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        elements.previewImage.src = e.target.result;
        elements.uploadContent.style.display = 'none';
        elements.uploadPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // Enable detect button
    elements.detectBtn.disabled = false;

    // Hide previous results
    elements.resultPlaceholder.style.display = 'flex';
    elements.resultContent.style.display = 'none';

    showToast('success', 'Image loaded successfully!');
}

// ─── Confidence Slider ───────────────────────────────────────────────────────

elements.confidenceSlider.addEventListener('input', (e) => {
    elements.confidenceValue.textContent = parseFloat(e.target.value).toFixed(2);
});

// ─── Detection ───────────────────────────────────────────────────────────────

elements.detectBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    setLoading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const response = await fetch('/detect', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Detection failed');
        }

        const result = await response.json();
        displayResults(result);
        showToast('success', `Detected ${result.shrimp_count} shrimp!`);

    } catch (error) {
        showToast('error', error.message || 'An error occurred during detection');
        console.error('Detection error:', error);
    } finally {
        setLoading(false);
    }
});

function setLoading(loading) {
    elements.detectBtn.disabled = loading;
    elements.btnContent.style.display = loading ? 'none' : 'inline-flex';
    elements.btnLoading.style.display = loading ? 'inline-flex' : 'none';
}

// ─── Display Results ─────────────────────────────────────────────────────────

function displayResults(result) {
    // Show result content
    elements.resultPlaceholder.style.display = 'none';
    elements.resultContent.style.display = 'block';

    // Animate count
    animateValue(elements.shrimpCount, 0, result.shrimp_count, 800);
    elements.avgConfidence.textContent = `${(result.average_confidence * 100).toFixed(1)}%`;
    elements.processingTime.textContent = `${result.processing_time}s`;

    // Set annotated image
    currentResultImageUrl = result.annotated_image_url;
    elements.annotatedImage.src = result.annotated_image_url;

    // Build detections table
    elements.detectionsBody.innerHTML = '';
    result.detections.forEach((det, index) => {
        const row = document.createElement('tr');
        const confidenceClass = det.confidence >= 0.7 ? 'high' : det.confidence >= 0.4 ? 'medium' : 'low';
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${det.class}</td>
            <td>
                <span class="confidence-badge confidence-${confidenceClass}">
                    ${(det.confidence * 100).toFixed(1)}%
                </span>
            </td>
            <td style="font-size:12px;color:var(--text-muted)">
                (${Math.round(det.bbox.x1)}, ${Math.round(det.bbox.y1)}) —
                (${Math.round(det.bbox.x2)}, ${Math.round(det.bbox.y2)})
            </td>
        `;
        elements.detectionsBody.appendChild(row);
    });

    // If no detections
    if (result.detections.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">
                No shrimp detected. Try lowering the confidence threshold.
            </td>
        `;
        elements.detectionsBody.appendChild(row);
    }

    // Scroll to results on mobile
    if (window.innerWidth <= 1024) {
        elements.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ─── Animate Number ──────────────────────────────────────────────────────────

function animateValue(element, start, end, duration) {
    const range = end - start;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + range * easeOut);

        element.textContent = current;

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// ─── Download ────────────────────────────────────────────────────────────────

elements.downloadBtn.addEventListener('click', () => {
    if (!currentResultImageUrl) return;

    const link = document.createElement('a');
    link.href = currentResultImageUrl;
    link.download = `shrimp_detection_result_${Date.now()}.jpg`;
    link.click();

    showToast('success', 'Image downloaded!');
});

// ─── Toast Notifications ─────────────────────────────────────────────────────

let toastTimeout = null;

function showToast(type, message) {
    if (toastTimeout) clearTimeout(toastTimeout);

    const icons = {
        success: '\u2705',
        error: '\u274C',
        info: '\u2139\uFE0F',
    };

    elements.toastIcon.textContent = icons[type] || icons.info;
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');

    toastTimeout = setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 4000);
}

// ─── Smooth Scroll for Nav Links ─────────────────────────────────────────────

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href');
        const target = document.querySelector(targetId);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }

        // Update active state
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    });
});

// ─── Health Check ─────────────────────────────────────────────────────────────

async function checkHealth() {
    try {
        const response = await fetch('/health');
        const data = await response.json();
        const statusText = document.querySelector('.status-text');
        const statusDot = document.querySelector('.status-dot');

        if (data.status === 'healthy') {
            statusText.textContent = 'Model Ready';
            statusDot.style.background = 'var(--accent-green)';
        } else {
            statusText.textContent = 'Model Error';
            statusDot.style.background = '#ef4444';
        }
    } catch {
        const statusText = document.querySelector('.status-text');
        const statusDot = document.querySelector('.status-dot');
        statusText.textContent = 'Offline';
        statusDot.style.background = '#ef4444';
    }
}

// Run health check on load
checkHealth();

// ─── Active Section Highlight on Scroll ──────────────────────────────────────

const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
    const scrollY = window.scrollY + 100;

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionId = section.getAttribute('id');

        if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${sectionId}`) {
                    link.classList.add('active');
                }
            });
        }
    });
});
