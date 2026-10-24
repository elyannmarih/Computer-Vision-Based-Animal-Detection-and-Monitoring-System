/** Pure upload rules shared by the browser and Next.js server. FastAPI validates independently. */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
