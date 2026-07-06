const { S3Client } = require('@aws-sdk/client-s3');

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'portal-videos';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const isR2Configured = () => {
  return !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY);
};

module.exports = { r2Client, R2_BUCKET, R2_PUBLIC_URL, isR2Configured };
