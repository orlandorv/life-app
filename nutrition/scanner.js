import { $, openModal, closeModal, onModalClosed } from '../life/dom.js';

/**
 * Barcode scanning with the phone camera. iPhone Safari has no built-in
 * barcode reader, so this uses ZXing (vendor/zxing, Apache-2.0), loaded only
 * the first time you scan so it never slows down opening the app.
 *
 * Frames are cropped to the guide box and decoded a few times a second,
 * looking only for food barcodes (EAN-13/8, UPC-A/E), which is faster and
 * steadier than asking ZXing to try every format.
 */

const SCRIPT = 'vendor/zxing/zxing.min.js';
const FRAME_MS = 120;
let loading = null;

function loadZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    loading ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPT;
        script.onload = () => resolve(window.ZXing);
        script.onerror = () => {
            loading = null;
            script.remove();
            reject(new Error('Couldn’t load the scanner. Check your connection and try again.'));
        };
        document.head.append(script);
    });
    return loading;
}

function makeReader(ZXing) {
    const reader = new ZXing.MultiFormatReader();
    const formats = [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E];
    reader.setHints(new Map([
        [ZXing.DecodeHintType.POSSIBLE_FORMATS, formats],
        [ZXing.DecodeHintType.TRY_HARDER, true],
    ]));
    return reader;
}

/** Decodes a barcode from a canvas, or returns null. Exported so decoding can be checked without a camera. */
export async function decodeCanvas(canvas) {
    const ZXing = await loadZXing();
    return decodeWith(ZXing, makeReader(ZXing), canvas);
}

function decodeWith(ZXing, reader, canvas) {
    try {
        const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
        const result = reader.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source)));
        return result.getText();
    } catch {
        // NotFound / checksum / format errors all just mean "not this frame".
        return null;
    } finally {
        reader.reset();
    }
}

function cameraError(error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        return 'Camera access is off for Life. Allow it in Settings › Safari › Camera, or type the barcode below.';
    }
    if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
        return 'No camera found. Type the barcode below instead.';
    }
    return 'Couldn’t start the camera. Type the barcode below instead.';
}

/**
 * Opens the scanner. Resolves with the barcode digits, or null if closed.
 * Typing the number into the sheet works too, and is the fallback when the
 * camera is unavailable or blocked.
 */
export function scanBarcode() {
    return new Promise((resolve) => {
        const video = $('#scan-video');
        const status = $('#scan-status');
        const manual = $('#scan-manual');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });

        let stream = null;
        let timer = null;
        let finished = false;

        const stop = () => {
            clearInterval(timer);
            stream?.getTracks().forEach((track) => track.stop());
            stream = null;
            video.srcObject = null;
        };

        const finish = (code) => {
            if (finished) return;
            finished = true;
            stop();
            unsubscribe();
            manual.onsubmit = null;
            closeModal('scan-modal');
            resolve(code);
        };

        const unsubscribe = onModalClosed('scan-modal', () => finish(null));

        manual.reset();
        manual.onsubmit = (event) => {
            event.preventDefault();
            const digits = manual.elements.code.value.replace(/\D/g, '');
            if (digits.length >= 8) finish(digits);
            else status.textContent = 'Barcodes are 8 to 13 digits.';
        };

        status.textContent = 'Starting camera…';
        openModal('scan-modal');

        (async () => {
            let ZXing;
            try {
                ZXing = await loadZXing();
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                });
            } catch (error) {
                if (!finished) status.textContent = error.message?.startsWith('Couldn’t load') ? error.message : cameraError(error);
                return;
            }
            if (finished) {
                stop();
                return;
            }

            video.srcObject = stream;
            await video.play().catch(() => {});
            status.textContent = 'Point the camera at the barcode';
            const reader = makeReader(ZXing);

            timer = setInterval(() => {
                const width = video.videoWidth;
                const height = video.videoHeight;
                if (!width || !height) return;

                // The middle band of the frame, where the guide box is.
                const cropWidth = Math.round(width * 0.8);
                const cropHeight = Math.round(height * 0.4);
                canvas.width = cropWidth;
                canvas.height = cropHeight;
                context.drawImage(video, (width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

                const code = decodeWith(ZXing, reader, canvas);
                if (code) {
                    navigator.vibrate?.(40);
                    finish(code);
                }
            }, FRAME_MS);
        })();
    });
}
