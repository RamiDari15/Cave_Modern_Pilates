const unavailable = () => Object.assign(new Error('Deletion email delivery is not configured.'), { status: 503 });
export function googleMailConfig(env = process.env) {
  const user = String(env.GOOGLE_SMTP_USER || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) return null;
  const password = String(env.GOOGLE_APP_PASSWORD || '').replace(/\s/g, '');
  const oauth = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN;
  if (!oauth && !password) return null;
  return { host: 'smtp.gmail.com', port: 465, secure: true,
    auth: oauth ? { type: 'OAuth2', user, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, refreshToken: env.GOOGLE_REFRESH_TOKEN } : { user, pass: password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true };
}
export async function sendGoogleDeletionMail(message, env = process.env, createTransport) {
  const config = googleMailConfig(env);
  if (!config) throw unavailable();
  const factory = createTransport || (await import('nodemailer')).default.createTransport;
  const transport = factory(config);
  try {
    const result = await transport.sendMail({ from: env.DELETION_EMAIL_FROM || config.auth.user,
      to: message.to, replyTo: 'support@cavemodernpilates.com', subject: message.subject, text: message.text,
      messageId: `<cave-deletion-${message.id}@cavemodernpilates.com>` });
    if (!result.accepted?.some(address => String(address).toLowerCase() === message.to.toLowerCase()) || result.rejected?.length) {
      throw unavailable();
    }
    return { accepted: true };
  } catch {
    // Never expose SMTP responses, server details, or credentials in API errors.
    throw Object.assign(new Error('Confirmation email could not be sent. The request remains open for retry.'), { status: 503 });
  } finally { transport.close?.(); }
}
