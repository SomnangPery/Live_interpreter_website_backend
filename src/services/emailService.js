import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

/**
 * Create transport instance based on server config
 */
function createTransporter() {
  if (!config.smtpHost || !config.smtpUser) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

/**
 * Send 6-digit email verification code to user
 * @param {Object} params
 * @param {string} params.toEmail - Recipient email address
 * @param {string} params.code - 6-digit verification code
 * @param {string} [params.displayName] - User's display name
 */
export async function sendVerificationEmail({ toEmail, code, displayName }) {
  const recipientName = displayName || 'User';
  const transporter = createTransporter();

  // If SMTP is not configured, print prominent console output for development/testing
  if (!transporter) {
    console.log('\n==================================================');
    console.log(' 📧 [EMAIL VERIFICATION CODE - DEV / CONSOLE LOG]');
    console.log(` To: ${toEmail}`);
    console.log(` Name: ${recipientName}`);
    console.log(` Verification Code: ${code}`);
    console.log(' Note: To send actual emails, configure SMTP_HOST & SMTP_USER in .env');
    console.log('==================================================\n');
    return { sent: false, simulated: true, code };
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify your Email Address</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eaeaea; }
        .header h1 { color: #4F46E5; margin: 0; font-size: 24px; font-weight: 700; }
        .content { padding: 30px 0; text-align: center; }
        .greeting { font-size: 16px; margin-bottom: 20px; color: #4b5563; text-align: left; }
        .code-box { display: inline-block; background-color: #EEF2FF; border: 2px dashed #6366F1; border-radius: 10px; padding: 18px 36px; margin: 25px 0; }
        .code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #4338CA; font-family: monospace; }
        .subtext { font-size: 14px; color: #6b7280; margin-top: 20px; text-align: left; line-height: 1.5; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af; border-top: 1px solid #eaeaea; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Live Interpreter</h1>
        </div>
        <div class="content">
          <div class="greeting">Hello ${recipientName},</div>
          <p style="text-align: left; color: #4b5563;">Thank you for joining Live Interpreter! Please use the following 6-digit verification code to complete your registration:</p>
          <div class="code-box">
            <span class="code">${code}</span>
          </div>
          <div class="subtext">
            <p>This code will expire in <strong>15 minutes</strong>.</p>
            <p>If you did not request this verification email, please safely ignore it.</p>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Live Interpreter. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: config.smtpFrom,
    to: toEmail,
    subject: `Your Verification Code: ${code} - Live Interpreter`,
    text: `Hello ${recipientName},\n\nYour 6-digit verification code is: ${code}\n\nThis code will expire in 15 minutes.\n\nLive Interpreter Team`,
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Verification email sent to ${toEmail}. Message ID: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send email to ${toEmail}:`, error.message);
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}

/**
 * Send 6-digit password reset OTP email to user
 * @param {Object} params
 * @param {string} params.toEmail - Recipient email address
 * @param {string} params.code - 6-digit password reset code
 * @param {string} [params.displayName] - User's display name
 */
export async function sendPasswordResetEmail({ toEmail, code, displayName }) {
  const recipientName = displayName || 'User';
  const transporter = createTransporter();

  if (!transporter) {
    console.log('\n==================================================');
    console.log(' 🔐 [PASSWORD RESET CODE - DEV / CONSOLE LOG]');
    console.log(` To: ${toEmail}`);
    console.log(` Name: ${recipientName}`);
    console.log(` Reset Code: ${code}`);
    console.log(' Note: To send actual emails, configure SMTP_HOST & SMTP_USER in .env');
    console.log('==================================================\n');
    return { sent: false, simulated: true, code };
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reset Your Password</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eaeaea; }
        .header h1 { color: #DC2626; margin: 0; font-size: 24px; font-weight: 700; }
        .content { padding: 30px 0; text-align: center; }
        .greeting { font-size: 16px; margin-bottom: 20px; color: #4b5563; text-align: left; }
        .code-box { display: inline-block; background-color: #FEF2F2; border: 2px dashed #EF4444; border-radius: 10px; padding: 18px 36px; margin: 25px 0; }
        .code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #991B1B; font-family: monospace; }
        .subtext { font-size: 14px; color: #6b7280; margin-top: 20px; text-align: left; line-height: 1.5; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af; border-top: 1px solid #eaeaea; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Live Interpreter</h1>
        </div>
        <div class="content">
          <div class="greeting">Hello ${recipientName},</div>
          <p style="text-align: left; color: #4b5563;">We received a request to reset your password for your Live Interpreter account. Please use the following 6-digit code to complete your password reset:</p>
          <div class="code-box">
            <span class="code">${code}</span>
          </div>
          <div class="subtext">
            <p>This password reset code will expire in <strong>15 minutes</strong>.</p>
            <p>If you did not request a password reset, please ignore this email or secure your account if you suspect unauthorized activity.</p>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Live Interpreter. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: config.smtpFrom,
    to: toEmail,
    subject: `Password Reset Code: ${code} - Live Interpreter`,
    text: `Hello ${recipientName},\n\nYour 6-digit password reset code is: ${code}\n\nThis code will expire in 15 minutes.\n\nLive Interpreter Team`,
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Password reset email sent to ${toEmail}. Message ID: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send password reset email to ${toEmail}:`, error.message);
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}
