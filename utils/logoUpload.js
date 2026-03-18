const path = require('path');

/**
 * Logo upload directory. Uses persistent storage on Railway when a volume is mounted.
 * - LOGO_UPLOAD_DIR: explicit path (e.g. /data/booking-logos)
 * - RAILWAY_VOLUME_MOUNT_PATH: Railway sets this when a volume is attached; we use <mount>/booking-logos
 * - Default: ./uploads/booking-logos (ephemeral on Railway)
 */
function getLogoUploadDir() {
  if (process.env.LOGO_UPLOAD_DIR) {
    return path.join(process.env.LOGO_UPLOAD_DIR);
  }
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'booking-logos');
  }
  return path.join(__dirname, '../uploads/booking-logos');
}

module.exports = { getLogoUploadDir };
