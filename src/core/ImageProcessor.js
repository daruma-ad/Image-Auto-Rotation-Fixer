import * as EXIF_Import from 'exif-js';
const EXIF = EXIF_Import.default || EXIF_Import;

export class ImageProcessor {
  /**
   * Reads the EXIF orientation from a File object.
   * @param {File} file 
   * @returns {Promise<number>} Orientation value (1-8), default 1.
   */
  static getOrientation(file) {
    return new Promise((resolve) => {
      let accepted = false;
      const safeResolve = (val) => {
        if (!accepted) {
          accepted = true;
          resolve(val);
        }
      };

      try {
        EXIF.getData(file, function () {
          const result = EXIF.getTag(this, "Orientation");
          safeResolve(result || 1);
        });
      } catch (err) {
        console.warn('EXIF parsing failed:', err);
        safeResolve(1);
      }

      setTimeout(() => {
        if (!accepted) {
          console.warn('EXIF parsing timed out:', file.name);
          safeResolve(1);
        }
      }, 1500);
    });
  }

  /**
   * Loads an image file into an HTMLImageElement.
   * @param {File} file 
   * @returns {Promise<HTMLImageElement>}
   */
  static loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Rotates and/or resizes an image.
   * @param {File} file - Original file
   * @param {object} options 
   * @param {number} options.orientation - EXIF orientation or manual rotation (1, 3, 6, 8)
   * @param {number} options.manualRotation - Additional manual rotation (0, 90, 180, 270)
   * @param {string} options.resizeMode - 'none', 'width', 'height', 'both-fit', 'both-force'
   * @param {number} options.targetWidth 
   * @param {number} options.targetHeight
   * @param {boolean} options.stripExif
   * @returns {Promise<Blob>} processed image blob
   */
  static async process(file, options) {
    const {
      orientation = 1,
      manualRotation = 0,
      resizeMode = 'none',
      targetWidth,
      targetHeight,
      exportFormat = 'auto'
    } = options;

    const img = await this.loadImage(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Determine MIME Type early
    let mimeType = 'image/jpeg'; // Default
    if (exportFormat === 'png') {
      mimeType = 'image/png';
    } else if (exportFormat === 'jpeg') {
      mimeType = 'image/jpeg';
    } else {
      // Auto mode
      if (options.maxSizeBytes) {
        mimeType = 'image/jpeg'; // Force JPEG for compression
      } else {
        mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      }
    }

    // 1. Calculate dimensions after rotation
    // Dimensions swap if rotated 90 or 270 degrees (EXIF 5-8 generally, here focused on 6 & 8)
    // EXIF 6: 90 CW, EXIF 8: 90 CCW (270 CW)
    // Plus manual rotation

    // Determine visual width/height after EXIF correction
    let width = img.width;
    let height = img.height;

    // Adjust for EXIF orientation dimension swap
    if (orientation >= 5 && orientation <= 8) {
      width = img.height;
      height = img.width;
    }

    // Adjust for Manual Rotation (swaps again if 90 or 270)
    // manualRotation is in degrees (0, 90, 180, 270)
    // We treat manual rotation as applied AFTER EXIF correction for simplicity in logic,
    // OR we combine angles. Let's do step-by-step canvas transform.

    // Actually, it's easier to first determine the *target* canvas dimensions based on resize AND rotation.
    // Let's first resolve the "upright" image dimensions (post-EXIF, pre-resize).

    // Visual dimensions after EXIF fix:
    let uprightW = (orientation >= 5 && orientation <= 8) ? img.height : img.width;
    let uprightH = (orientation >= 5 && orientation <= 8) ? img.width : img.height;

    // Visual dimensions after Manual Rotation:
    if (manualRotation === 90 || manualRotation === 270) {
      [uprightW, uprightH] = [uprightH, uprightW];
    }

    // 2. Calculate final export dimensions (Resizing)
    let finalW = uprightW;
    let finalH = uprightH;

    if (resizeMode === 'width' && targetWidth) {
      finalW = targetWidth;
      finalH = (uprightH / uprightW) * targetWidth;
    } else if (resizeMode === 'height' && targetHeight) {
      finalH = targetHeight;
      finalW = (uprightW / uprightH) * targetHeight;
    } else if (resizeMode === 'both-fit' && targetWidth && targetHeight) {
      // Fit within box, maintaining aspect ratio
      const ratio = Math.min(targetWidth / uprightW, targetHeight / uprightH);
      finalW = uprightW * ratio;
      finalH = uprightH * ratio;
    } else if (resizeMode === 'both-force' && targetWidth && targetHeight) {
      finalW = targetWidth;
      finalH = targetHeight;
    }

    finalW = Math.round(finalW);
    finalH = Math.round(finalH);

    // Set canvas to final size
    canvas.width = finalW;
    canvas.height = finalH;

    // 3. Draw to Canvas
    // To draw correctly, we need to map the transform.
    // Complex transforms can be tricky.
    // Strategy: Translate to center -> Rotate -> Scale -> Draw -> (Wait, resizing is scaling).

    // We need to apply TWO rotations: EXIF and Manual.
    // Let's normalize EXIF rotation to degrees CW.
    let exifDeg = 0;
    switch (orientation) {
      case 3: exifDeg = 180; break;
      case 6: exifDeg = 90; break;
      case 8: exifDeg = 270; break;
      // Mirroring (2, 4, 5, 7) not strictly required by prompt but good to keep in mind. 
      // Prompt says "Rotate image pixels... Values 1-8".
      // Let's stick to standard 90 deg steps for now as per prompt "Orientation Reference Table".
    }

    const totalDeg = (exifDeg + manualRotation) % 360;

    // Context Save
    ctx.save();

    // Move to center of the canvas
    ctx.translate(finalW / 2, finalH / 2);

    // Rotate
    ctx.rotate((totalDeg * Math.PI) / 180);

    // Determine scale factors
    // We are drawing the original image onto the rotated canvas.
    // If we rotated 90/270, the "width" of the image matches the "height" of the canvas (roughly).

    if (totalDeg === 90 || totalDeg === 270) {
      // Image width maps to Canvas Height
      ctx.scale(finalH / img.width, finalW / img.height);
    } else {
      ctx.scale(finalW / img.width, finalH / img.height);
    }

    // Note: The simple scale above might distort if we are doing aspect-ratio preserving resize but
    // calculated finalW/finalH correctly.
    // Actually, if we use separate scale X/Y like above for 'force', it works.
    // For 'fit' or 'maintain aspect', X scale and Y scale should be identical.
    // Let's re-verify logic.
    // If totalDeg 0: Draw width=img.width, but we need it to fill finalW. so scale = finalW / img.width.
    // If we used 'both-force', finalW/img.width might != finalH/img.height. So non-uniform scaling is correct.

    // Draw Image centered
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    ctx.restore();

    return new Promise(async (resolve) => {
      let quality = 0.95;

      // Helper to get blob at specific quality
      const getBlob = (q) => new Promise(res => canvas.toBlob(res, mimeType, q));

      // File size limit ONLY works for JPEG
      if (!options.maxSizeBytes || mimeType === 'image/png') {
        const blob = await getBlob(quality);
        resolve(blob);
        return;
      }

      // Binary search for Target File Size (JPEG only via mimeType conversion above)
      let minQ = 0.01;
      let maxQ = 1.0;
      let bestBlob = null;
      let attempts = 0;

      // Check max quality first
      const maxBlob = await getBlob(1.0);
      console.log(`Initial size at max quality: ${(maxBlob.size / 1024).toFixed(2)} KB (Target: ${(options.maxSizeBytes / 1024).toFixed(2)} KB)`);

      if (maxBlob.size <= options.maxSizeBytes) {
        resolve(maxBlob);
        return;
      }

      // Increased iterations for better precision (10 attempts)
      while (attempts < 10) {
        const midQ = (minQ + maxQ) / 2;
        const blob = await getBlob(midQ);

        if (blob.size <= options.maxSizeBytes) {
          bestBlob = blob;
          minQ = midQ; // Try higher quality
        } else {
          maxQ = midQ; // Reduce quality
        }
        attempts++;
      }

      if (bestBlob) {
        console.log(`Target size met: ${(bestBlob.size / 1024).toFixed(2)} KB`);
        resolve(bestBlob);
      } else {
        const minBlob = await getBlob(0.01);
        console.log(`Coult not meet target size. Returning smallest version: ${(minBlob.size / 1024).toFixed(2)} KB`);
        resolve(minBlob); // Return lowest quality if fails
      }
    });
  }
}
