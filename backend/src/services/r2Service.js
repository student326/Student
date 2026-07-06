const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2Client, R2_BUCKET, isR2Configured } = require('../config/r2');
const crypto = require('crypto');

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const generateKey = (userId, originalName) => {
  const ext = originalName.split('.').pop().toLowerCase();
  const uniqueId = crypto.randomBytes(16).toString('hex');
  return `videos/${userId}/${Date.now()}-${uniqueId}.${ext}`;
};

const uploadVideo = async (fileBuffer, fileName, mimeType, userId) => {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY, and R2_SECRET_KEY environment variables.');
  }

  const key = generateKey(userId, fileName);

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await r2Client.send(command);
  return key;
};

const deleteVideo = async (key) => {
  if (!key) return;
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  await r2Client.send(command);
};

const generateStreamUrl = async (key, expiresIn = 3600) => {
  if (!key) return null;

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ResponseContentDisposition: 'inline',
  });

  const url = await getSignedUrl(r2Client, command, { expiresIn });
  return url;
};

const validateVideoFile = (mimeType, fileSize) => {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    throw new Error(`Invalid video type: ${mimeType}. Allowed: MP4, MOV, AVI, MKV, WEBM`);
  }
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }
  return true;
};

module.exports = { uploadVideo, deleteVideo, generateStreamUrl, validateVideoFile, ALLOWED_TYPES, MAX_FILE_SIZE };
