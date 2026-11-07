import { fitWithin, PHOTO_MAX_EDGE, PHOTO_QUALITY, isPhotoData } from './organize.js';

/**
 * Turns a picture the person chose (from the camera or the library) into the small
 * JPEG data URL the wardrobe keeps. It is drawn onto a canvas at most `PHOTO_MAX_EDGE`
 * pixels on its longest side, which also applies the phone's rotation, so a portrait
 * photo isn't stored on its side. Nothing leaves the phone.
 */
export async function photoFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('That file isn’t a picture the phone can read.'));
            img.src = url;
        });
        const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, PHOTO_MAX_EDGE);
        if (!width) throw new Error('That picture has no size.');
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        // A white ground, so a transparent PNG doesn't turn black as a JPEG.
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const data = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
        if (!isPhotoData(data)) throw new Error('That picture is too large to keep.');
        return data;
    } finally {
        URL.revokeObjectURL(url);
    }
}
