module.exports = {
  apps: [
    {
      name: 'attendance-payroll-api',
      script: 'server.js',
      cwd: '/var/www/attendance-payroll/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/pm2/attendance-payroll-error.log',
      out_file: '/var/log/pm2/attendance-payroll-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
