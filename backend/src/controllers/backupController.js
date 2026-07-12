const fs     = require('fs');
const os     = require('os');
const multer = require('multer');
const db     = require('../config/db');
const svc    = require('../services/backupService');

// multer: store restore uploads in OS temp dir
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter(_req, file, cb) {
    if (file.originalname.endsWith('.sql')) cb(null, true);
    else cb(new Error('Only .sql files are accepted'));
  },
});

// POST /api/backups
async function createBackup(req, res) {
  try {
    const { notes } = req.body;
    const record = await svc.createBackup(req.user.userId, notes);
    res.status(201).json(record);
  } catch (err) {
    console.error('[backup] create:', err.message);
    res.status(500).json({ message: err.message || 'Failed to create backup' });
  }
}

// GET /api/backups
async function listBackups(req, res) {
  try {
    const data = await svc.listBackups();
    res.json({ data });
  } catch (err) {
    console.error('[backup] list:', err.message);
    res.status(500).json({ message: 'Failed to list backups' });
  }
}

// GET /api/backups/:id/download
async function downloadBackup(req, res) {
  try {
    const { rows } = await db.query('SELECT * FROM backups WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Backup not found' });

    const record = rows[0];
    if (!fs.existsSync(record.file_path)) {
      return res.status(404).json({ message: 'Backup file not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${record.filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(record.file_path).pipe(res);
  } catch (err) {
    console.error('[backup] download:', err.message);
    res.status(500).json({ message: 'Failed to download backup' });
  }
}

// DELETE /api/backups/:id
async function deleteBackup(req, res) {
  try {
    await svc.deleteBackup(req.params.id);
    res.json({ message: 'Backup deleted' });
  } catch (err) {
    console.error('[backup] delete:', err.message);
    const status = err.message === 'Backup not found' ? 404 : 500;
    res.status(status).json({ message: err.message || 'Failed to delete backup' });
  }
}

// POST /api/backups/restore  (multipart upload)
const restoreUpload = upload.single('file');

async function restoreBackup(req, res) {
  restoreUpload(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ message: uploadErr.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Rename to .sql so psql recognises it (multer strips the extension)
    const tempPath = req.file.path + '.sql';
    try {
      fs.renameSync(req.file.path, tempPath);
    } catch {
      // rename failed — proceed with original multer path
    }
    const actualPath = fs.existsSync(tempPath) ? tempPath : req.file.path;

    try {
      await svc.restoreBackup(actualPath);
      res.json({ message: 'Database restored successfully. Please refresh the application.' });
    } catch (err) {
      console.error('[backup] restore:', err.message);
      res.status(500).json({ message: err.message || 'Restore failed' });
    }
  });
}

module.exports = { createBackup, listBackups, downloadBackup, deleteBackup, restoreBackup };
