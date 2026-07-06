const { google } = require('googleapis');

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
const SERVICE_KEY_BASE64 = process.env.GOOGLE_DRIVE_SERVICE_KEY;

let authClient = null;
let driveClient = null;

const initDrive = () => {
  if (!DRIVE_FOLDER_ID || !SERVICE_KEY_BASE64) {
    return null;
  }

  try {
    const keyJson = Buffer.from(SERVICE_KEY_BASE64, 'base64').toString('utf-8');
    const credentials = JSON.parse(keyJson);

    authClient = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/drive.file']
    );

    driveClient = google.drive({ version: 'v3', auth: authClient });
    return driveClient;
  } catch (err) {
    console.error('Failed to initialize Google Drive client:', err.message);
    return null;
  }
};

const getDriveClient = () => {
  if (!driveClient) {
    return initDrive();
  }
  return driveClient;
};

const isDriveConfigured = () => {
  return !!(DRIVE_FOLDER_ID && SERVICE_KEY_BASE64);
};

module.exports = { getDriveClient, isDriveConfigured, DRIVE_FOLDER_ID };
