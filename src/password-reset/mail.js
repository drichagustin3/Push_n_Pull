const nodemailer = require('nodemailer');

function createResetMailer(config, logger = console) {
  const transport = config.mode === 'smtp' ? nodemailer.createTransport(config.smtp) : null;
  return {
    async send(to, rawToken) {
      const link = new URL('/reset-password', config.appUrl);
      link.hash = `token=${rawToken}`;
      if (!transport) {
        // Explicitly authorized development fallback; never enabled in production.
        logger.log('[development] Password reset link:', link.href);
        return;
      }
      await transport.sendMail({
        from: config.from, to, subject: 'Reset your Hope, Inc. ERP password',
        text: `Reset your password using this private link (expires in one hour):\n${link.href}\n\nIf you did not request this change, ignore this message.`,
        disableFileAccess: true, disableUrlAccess: true,
      });
    },
    close() { transport?.close(); },
  };
}

module.exports = { createResetMailer };
