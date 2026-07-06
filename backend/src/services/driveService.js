const { getDriveClient, isDriveConfigured, DRIVE_FOLDER_ID } = require('../config/drive');
const stream = require('stream');

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
const MAX_FILE_SIZE = 500 * 1024 * 1024;

const validateVideoFile = (mimeType, fileSize) => {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    throw new Error(`Invalid video type: ${mimeType}. Allowed: MP4, MOV, AVI, MKV, WEBM`);
  }
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }
  return true;
};

const ensureCourseFolder = async (courseName) => {
  const drive = getDriveClient();
  if (!drive) throw new Error('Google Drive is not configured');

  const safeName = courseName.replace(/[\\/:"*?<>|]+/g, '-').trim();

  const listRes = await drive.files.list({
    q: `name='${safeName.replace(/'/g, "\\'")}' and '${DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (listRes.data.files.length > 0) {
    return listRes.data.files[0].id;
  }

  const folderRes = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [DRIVE_FOLDER_ID],
    },
    fields: 'id, name',
  });

  return folderRes.data.id;
};

const uploadVideo = async (fileBuffer, fileName, mimeType, courseName) => {
  const drive = getDriveClient();
  if (!drive) throw new Error('Google Drive is not configured');

  const folderId = await ensureCourseFolder(courseName);

  const bufferStream = new stream.PassThrough();
  bufferStream.end(fileBuffer);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType,
      body: bufferStream,
    },
    fields: 'id, name, webViewLink, size, mimeType',
  });

  const file = res.data;

  return {
    driveFileId: file.id,
    driveFileName: file.name,
    driveWebViewLink: file.webViewLink,
    driveFolderId: folderId,
    driveFolderName: courseName,
    driveMimeType: file.mimeType,
  };
};

const deleteVideo = async (fileId) => {
  const drive = getDriveClient();
  if (!drive) return;

  try {
    await drive.files.delete({ fileId });
  } catch (err) {
    console.error('Failed to delete Drive file:', err.message);
  }
};

const getStreamUrl = async (fileId) => {
  const drive = getDriveClient();
  if (!drive) throw new Error('Google Drive is not configured');

  try {
    const file = await drive.files.get({
      fileId,
      fields: 'id, mimeType, size, name',
    });

    return {
      fileId: file.data.id,
      fileName: file.data.name,
      mimeType: file.data.mimeType,
      fileSize: file.data.size,
    };
  } catch (err) {
    console.error('Failed to get file info:', err.message);
    throw err;
  }
};

const makeEmbedUrl = (fileId) => {
  return `https://drive.google.com/file/d/${fileId}/preview`;
};

module.exports = { uploadVideo, deleteVideo, validateVideoFile, makeEmbedUrl, ensureCourseFolder, getStreamUrl };
