'use strict';

const bcrypt = require('bcrypt');

exports.up = async (pgm) => {
  const passwordHash = await bcrypt.hash('admin123', 12);
  pgm.sql(`
    INSERT INTO users (username, password_hash, role, password_changed)
    VALUES ('admin', '${passwordHash}', 'ADMIN', false)
    ON CONFLICT (username) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DELETE FROM users WHERE username = 'admin';`);
};
