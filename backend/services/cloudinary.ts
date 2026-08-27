import crypto from 'crypto';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
  secure: true
});

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

export function isCloudinaryConfigured(): boolean {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!name || name === 'kosmo-bali' || !secret || secret.includes('sample')) {
    return false;
  }
  return true;
}

export function uploadImageStream(
  buffer: Buffer,
  folder = 'kosmo_properties'
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reject(new Error('Image buffer cannot be empty'));
    }

    // If credentials are placeholders or unconfigured in testing, provide predictable CDN URL format
    if (!isCloudinaryConfigured()) {
      const mockPublicId = `${folder}/prop_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const mockUrl = `https://res.cloudinary.com/kosmo-bali/image/upload/v1/${mockPublicId}.webp`;
      return resolve({
        secure_url: mockUrl,
        public_id: mockPublicId
      });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        format: 'webp',
        transformation: [
          { fetch_format: 'auto', quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Upload to Cloudinary failed'));
        }
        resolve({
          secure_url: result.secure_url || result.url,
          public_id: result.public_id
        });
      }
    );

    const readableStream = new Readable({
      read() {
        this.push(buffer);
        this.push(null);
      }
    });

    readableStream.on('error', reject);
    readableStream.pipe(uploadStream);
  });
}

/**
 * Uploads an in-memory PDF contract buffer to Cloudinary raw storage via direct streaming.
 * Ensures zero local filesystem writes and provides deterministic mock fallback in test environments.
 *
 * @param buffer - Binary PDF buffer created in-memory
 * @param filename - Base contract filename or rental identifier
 * @param folder - Target Cloudinary folder (default: 'kosmo_contracts')
 * @returns Promise resolving to secure CDN URL and public ID
 */
export function uploadContractStream(
  buffer: Buffer,
  filename: string,
  folder = 'kosmo_contracts'
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reject(new Error('Contract buffer cannot be empty'));
    }

    const sanitizedBase = filename
      ? path.basename(filename.replace(/\\/g, '/')).replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_')
      : `contract_${Date.now()}`;
    const cleanPublicId = sanitizedBase || `contract_${Date.now()}`;
    const fullPublicId = `${folder}/${cleanPublicId}`;

    if (!isCloudinaryConfigured()) {
      const mockUrl = `https://res.cloudinary.com/kosmo-bali/raw/upload/v1/${fullPublicId}.pdf`;
      return resolve({
        secure_url: mockUrl,
        public_id: fullPublicId
      });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: cleanPublicId,
        resource_type: 'raw',
        overwrite: true
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Upload PDF contract to Cloudinary failed'));
        }
        resolve({
          secure_url: result.secure_url || result.url,
          public_id: result.public_id
        });
      }
    );

    const readableStream = new Readable({
      read() {
        this.push(buffer);
        this.push(null);
      }
    });

    readableStream.on('error', reject);
    readableStream.pipe(uploadStream);
  });
}

export { cloudinary };

