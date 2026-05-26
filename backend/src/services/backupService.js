const { spawn }  = require('child_process');
const fs          = require('fs');
const path        = require('path');
const db          = require('../config/db');

function getBackupDir() {
  const envDir = process.env.BACKUP_DIR;
  if (envDir) return path.resolve(envDir);
  return path.resolve(__dirname, '../../../backups');
}

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return '0 B';
  if (bytes < 1024)             return `${bytes} B`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function createBackup(userId, notes) {
  const now      = new Date();
  const pad      = n => String(n).padStart(2, '0');
  const dateStr  = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr  = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `attendance_backup_${dateStr}_${timeStr}.sql`;

  const backupDir = getBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const filePath = path.join(backupDir, filename);

  const host     = process.env.DB_HOST     || 'localhost';
  const port     = process.env.DB_PORT     || '5432';
  const user     = process.env.DB_USER     || 'postgres';
  const dbName   = process.env.DB_NAME     || 'attendance_db';
  const password = process.env.DB_PASSWORD || '';

  const args = [
    '--host',       host,
    '--port',       port,
    '--username',   user,
    '--dbname',     dbName,
    '--format',     'plain',
    '--no-password',
    '--file',       filePath,
  ];

  const env = { ...process.env, PGPASSWORD: password };

  await new Promise((resolve, reject) => {
    const proc = spawn('pg_dump', args, { env });
    proc.stderr.on('data', data => console.error('[backup] pg_dump:', data.toString()));
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}`));
    });
    proc.on('error', err => reject(new Error(`Failed to start pg_dump: ${err.message}. Is PostgreSQL client installed?`)));
  });

  const fileSize = fs.statSync(filePath).size;

  const { rows } = await db.query(
    `INSERT INTO backups (filename, file_path, file_size, created_by, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [filename, filePath, fileSize, userId || null, notes || null]
  );

  const record = rows[0];
  return { ...record, file_size_formatted: formatFileSize(record.file_size) };
}

async function listBackups() {
  const { rows } = await db.query(`
    SELECT b.id, b.filename, b.file_path, b.file_size, b.notes, b.created_at,
           u.username AS created_by_name
    FROM backups b
    LEFT JOIN users u ON u.id = b.created_by
    ORDER BY b.created_at DESC
  `);
  return rows.map(r => ({ ...r, file_size_formatted: formatFileSize(r.file_size) }));
}

async function deleteBackup(backupId) {
  const { rows } = await db.query('SELECT * FROM backups WHERE id = $1', [backupId]);
  if (!rows.length) throw new Error('Backup not found');
  const record = rows[0];

  if (fs.existsSync(record.file_path)) {
    fs.unlinkSync(record.file_path);
  }

  await db.query('DELETE FROM backups WHERE id = $1', [backupId]);
}

async function restoreBackup(tempFilePath) {
  const host     = process.env.DB_HOST     || 'localhost';
  const port     = process.env.DB_PORT     || '5432';
  const user     = process.env.DB_USER     || 'postgres';
  const dbName   = process.env.DB_NAME     || 'attendance_db';
  const password = process.env.DB_PASSWORD || '';

  const args = [
    '--host',               host,
    '--port',               port,
    '--username',           user,
    '--dbname',             dbName,
    '--file',               tempFilePath,
    '--single-transaction',
  ];

  const env = { ...process.env, PGPASSWORD: password };

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('psql', args, { env });
      proc.stderr.on('data', data => console.error('[restore] psql:', data.toString()));
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`psql exited with code ${code}`));
      });
      proc.on('error', err => reject(new Error(`Failed to start psql: ${err.message}. Is PostgreSQL client installed?`)));
    });
  } finally {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  }
}

module.exports = { createBackup, listBackups, deleteBackup, restoreBackup, getBackupDir };
