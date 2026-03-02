import JSZip from 'jszip';
// import { saveAs } from 'file-saver'; // Removed as we implemented a custom saveBlob function
// Actually, let's stick to standard anchor method for single files, but for ZIP we need a Blob.
// I should verify if I installed 'file-saver'. I did NOT.
// I will use a simple utility function for saving blobs.

import { ImageProcessor } from '../core/ImageProcessor.js';
import { DropZone } from './DropZone.js';

export class AppController {
    constructor() {
        this.files = []; // { id, file, originalOrientation, previewUrl }
        this.state = {
            autoFix: true,
            manualRotation: 0, // 0, 90, 180, 270
            resizeMode: 'none', // none, width, height, both-fit, both-force
            targetWidth: null,
            targetHeight: null,
            stripExif: true,
            exportFormat: 'auto'
        };

        // UI Elements
        this.dropZone = new DropZone('drop-zone', 'file-input', this.handleFiles.bind(this));
        this.editorSection = document.getElementById('editor-section');
        this.imageList = document.getElementById('image-list');

        // Inputs
        this.autoFixToggle = document.getElementById('auto-fix-toggle');
        this.stripExifToggle = document.getElementById('strip-exif-toggle');
        this.rotateLeftBtn = document.getElementById('rotate-left-btn');
        this.rotateRightBtn = document.getElementById('rotate-right-btn');
        this.resizeModeSelect = document.getElementById('resize-mode');
        this.resizeInputs = document.getElementById('resize-inputs');
        this.widthInput = document.getElementById('width-input');
        this.heightInput = document.getElementById('height-input');
        this.maxSizeInput = document.getElementById('max-size-input');
        this.formatSelect = document.getElementById('format-select');
        this.downloadBtn = document.getElementById('download-btn');

        this.initListeners();
    }

    initListeners() {
        this.autoFixToggle.addEventListener('change', (e) => {
            this.state.autoFix = e.target.checked;
            this.refreshPreviews();
        });

        this.stripExifToggle.addEventListener('change', (e) => {
            this.state.stripExif = e.target.checked;
        });

        this.rotateLeftBtn.addEventListener('click', () => {
            this.state.manualRotation = (this.state.manualRotation - 90 + 360) % 360;
            this.refreshPreviews();
        });

        this.rotateRightBtn.addEventListener('click', () => {
            this.state.manualRotation = (this.state.manualRotation + 90) % 360;
            this.refreshPreviews();
        });

        this.resizeModeSelect.addEventListener('change', (e) => {
            this.state.resizeMode = e.target.value;
            if (this.state.resizeMode === 'none') {
                this.resizeInputs.classList.add('hidden');
            } else {
                this.resizeInputs.classList.remove('hidden');
                // Handle input visibility based on mode? 
                // For simplicity, showing both inputs but disabling one if needed could be better,
                // but let's just show both.
            }
        });

        this.widthInput.addEventListener('input', (e) => this.state.targetWidth = parseInt(e.target.value));
        this.heightInput.addEventListener('input', (e) => this.state.targetHeight = parseInt(e.target.value));

        this.maxSizeInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            // Convert KB to Bytes
            this.state.maxSizeBytes = (val && val > 0) ? Math.floor(val * 1024) : null;
        });

        this.formatSelect.addEventListener('change', (e) => {
            this.state.exportFormat = e.target.value;
            this.updateUIState();
        });

        this.downloadBtn.addEventListener('click', () => this.handleDownload());
    }

    updateUIState() {
        const sizeHint = document.querySelector('.input-hint');
        if (this.state.exportFormat === 'png') {
            this.maxSizeInput.disabled = true;
            if (sizeHint) {
                sizeHint.textContent = 'File size limit is unavailable for PNG.';
                sizeHint.classList.add('disabled');
            }
        } else if (this.state.exportFormat === 'jpeg') {
            this.maxSizeInput.disabled = false;
            if (sizeHint) {
                sizeHint.textContent = 'Quality will be adjusted to meet size target.';
                sizeHint.classList.remove('disabled');
            }
        } else {
            // Auto
            this.maxSizeInput.disabled = false;
            if (sizeHint) {
                sizeHint.textContent = 'Target size for JPEGs. PNGs will be converted.';
                sizeHint.classList.remove('disabled');
            }
        }
    }

    async handleFiles(newFiles) {
        console.log('Files received:', newFiles);
        if (newFiles.length > 0) {
            document.getElementById('drop-zone').classList.add('hidden'); // Hide dropzone? Or make it smaller?
            // For now, let's keep dropzone but show editor.
            this.editorSection.classList.remove('hidden');

            // Process newly added files logic
            for (const file of newFiles) {
                console.log('Processing EXIF for:', file.name);
                const orientation = await ImageProcessor.getOrientation(file);
                console.log('Orientation:', orientation);
                const item = {
                    id: Date.now() + Math.random(),
                    file,
                    originalOrientation: orientation,
                    previewUrl: URL.createObjectURL(file)
                };
                this.files.push(item);
            }

            this.renderList();
        }
    }

    renderList() {
        this.imageList.innerHTML = '';
        this.files.forEach(item => {
            const card = document.createElement('div');
            card.className = 'image-card';

            const img = document.createElement('img');
            img.src = item.previewUrl;

            // Apply CSS visual rotation to preview WITHOUT processing
            // We want the preview to refect the *final output pixel orientation*.
            // So we need to emulate the rotation using CSS transform.

            let cssRotate = this.state.manualRotation;

            // If Auto-fix is ON, we correct the EXIF visual. 
            // Browsers handle EXIF display inconsistently. 
            // Most modern browsers AUTO-ROTATE images with EXIF 'Orientation'.
            // If the browser already rotates it, and we rotate it again, it's weird.
            // BUT `ImageProcessor` intends to hard-modify the pixels.
            // For the preview, relying on browser's default rendering of `img` tag is usually safer 
            // IF we assume the user sees what the browser sees.
            // However, prompt says "Images ... appear rotated ... inconsistently".
            // We should probably rely on the browser's display of the raw file, 
            // and apply a transform only for the Manual Rotation.
            // IF the browser respects EXIF, the image looks "correct" (upright).
            // If we then apply `manualRotation`, it rotates relative to that.

            // Let's assume modern Chrome (User's browser): It respects EXIF orientation 100%.
            // So `img.src = file` will show the image upright.
            // So we only need to apply `state.manualRotation` via CSS.

            img.style.transform = `rotate(${cssRotate}deg)`;
            img.style.transition = 'transform 0.3s ease';

            const info = document.createElement('div');
            info.className = 'card-info';
            info.innerHTML = `
        <div class="file-name" title="${item.file.name}">${item.file.name}</div>
        <div class="exif-badge">Exif: ${item.originalOrientation}</div>
      `;

            card.appendChild(img);
            card.appendChild(info);
            this.imageList.appendChild(card);
        });
    }

    refreshPreviews() {
        // Just re-render the list or update styles
        this.renderList();
    }

    async handleDownload() {
        if (this.files.length === 0) return;

        this.downloadBtn.textContent = 'Processing...';
        this.downloadBtn.disabled = true;

        try {
            const zip = new JSZip();

            // Process all images
            for (const item of this.files) {
                const processedBlob = await ImageProcessor.process(item.file, {
                    orientation: this.state.autoFix ? item.originalOrientation : 1, // If autoFix OFF, treat as 1 (no rotation)
                    manualRotation: this.state.manualRotation,
                    resizeMode: this.state.resizeMode,
                    targetWidth: this.state.targetWidth,
                    targetHeight: this.state.targetHeight,
                    maxSizeBytes: this.state.maxSizeBytes,
                    exportFormat: this.state.exportFormat
                });

                // Add to zip
                // Rename logic? Append _fixed
                const nameParts = item.file.name.split('.');
                const ext = nameParts.pop();
                const base = nameParts.join('.');
                const newName = `${base}_fixed.${ext}`;

                zip.file(newName, processedBlob);
            }

            if (this.files.length === 1) {
                // Single file download
                const item = this.files[0];
                const content = await zip.file(new RegExp(".*")).pop().async("blob"); // get the only file
                this.saveBlob(content, Object.keys(zip.files)[0]);
            } else {
                // Zip download
                const content = await zip.generateAsync({ type: 'blob' });
                this.saveBlob(content, 'images_fixed.zip');
            }

            // alert('Download Complete!'); // Optional success message

        } catch (err) {
            console.error(err);
            alert('Error processing images: ' + (err.message || err));
        } finally {
            this.downloadBtn.textContent = 'Download All';
            this.downloadBtn.disabled = false;
        }
    }

    saveBlob(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
