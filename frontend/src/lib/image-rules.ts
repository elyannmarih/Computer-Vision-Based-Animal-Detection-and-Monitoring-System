/** Pure upload rules shared by the browser and Next.js server. FastAPI validates independently. */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** A JPG, PNG, or WEBP file with a MIME type set.
 * WebKit can leave File.type empty for WEBP, so a known extension fills it in.
 * A declared type that is not an image is still rejected. */
export function acceptedImage(file: File): File | null {
  if (IMAGE_TYPES.has(file.type)) return file;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPE_BY_EXTENSION[extension];
  if (!type || (file.type !== "" && file.type !== "application/octet-stream")) return null;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}
