/**
 * Cloudinary image transformation utilities for responsive thumbnails and optimization.
 */

/**
 * Injects Cloudinary on-the-fly transformation parameters into an existing Cloudinary URL.
 * Returns the original URL unaltered if it is not a Cloudinary asset or is already transformed.
 *
 * @param url - Source image URL
 * @param width - Thumbnail target width in pixels (default: 128)
 * @param height - Thumbnail target height in pixels (default: 112)
 * @returns Transformed Cloudinary thumbnail URL or original URL
 */
export function getCloudinaryThumbUrl(url: string, width = 128, height = 112): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  // Only transform valid Cloudinary URLs
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return url;
  }

  // Prevent duplicate transformations if transformation parameters already exist
  if (url.includes('/upload/w_') || url.includes('/upload/c_')) {
    return url;
  }

  const transformParams = `w_${width},h_${height},c_fill,q_auto,f_auto`;
  return url.replace('/upload/', `/upload/${transformParams}/`);
}
