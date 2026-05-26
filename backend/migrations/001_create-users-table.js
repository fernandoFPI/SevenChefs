'use strict';

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    username: {
      type: 'varchar(100)',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'text',
      notNull: true,
    },
    role: {
      type: 'varchar(20)',
      notNull: true,
    },
    employee_id: {
      type: 'uuid',
      notNull: false,
    },
    is_active: {
      type: 'boolean',
      default: true,
      notNull: true,
    },
    password_changed: {
      type: 'boolean',
      default: false,
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
      notNull: true,
    },
    updated_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
      notNull: true,
    },
  });

  pgm.addConstraint('users', 'users_role_check', {
    check: "role IN ('ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE')",
  });
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
