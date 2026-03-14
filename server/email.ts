import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function getAppUrl(): string {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}`;
  return "http://localhost:5000";
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
}

function assertResendConfigured(): void {
  if (!resend) {
    throw new Error(
      "Email is not configured. Add RESEND_API_KEY to your environment secrets to send invite emails."
    );
  }
}

export async function sendWorkerInviteEmail(
  toEmail: string,
  username: string,
  token: string,
  orgName: string
): Promise<void> {
  const activateUrl = `${getAppUrl()}/?invite_token=${token}`;

  assertResendConfigured();

  console.log(`[email] Sending worker invite to ${toEmail} (username: ${username})`);

  const result = await resend!.emails.send({
    from: getFromAddress(),
    to: toEmail,
    subject: `You've been added to ${orgName} on RejectMap`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #111; margin-bottom: 8px;">You've been added to RejectMap</h2>
        <p style="color: #555; margin-bottom: 8px;">
          You have been added to <strong>${orgName}</strong> on RejectMap with the username:
        </p>
        <div style="background:#f4f4f5; border-radius:8px; padding:12px 20px; margin-bottom:20px; text-align:center;">
          <span style="font-family:monospace; font-size:20px; font-weight:700; color:#111;">@${username}</span>
        </div>
        <p style="color: #555; margin-bottom: 24px;">
          Click the button below to set your password and activate your account.
          This link expires in <strong>48 hours</strong>.
        </p>
        <a href="${activateUrl}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:600;">
          Set Password &amp; Sign In
        </a>
        <p style="color:#999; font-size:13px; margin-top:24px;">
          If you weren't expecting this, you can safely ignore this email.
        </p>
        <hr style="border:none; border-top:1px solid #eee; margin:24px 0;" />
        <p style="color:#aaa; font-size:12px;">RejectMap — Manufacturing parts rejection tracker</p>
      </div>
    `,
  });

  if (result.error) {
    console.error(`[email] Resend error for ${toEmail}:`, result.error);
    throw new Error(`Failed to send invite email: ${result.error.message}`);
  }

  console.log(`[email] Worker invite sent to ${toEmail} (id: ${result.data?.id})`);
}

export async function sendInviteEmail(toEmail: string, inviteCode: string, orgName: string, inviterEmail: string): Promise<void> {
  const joinUrl = `${getAppUrl()}/?join=1`;
  const fromAddress = getFromAddress();

  if (!resend) {
    console.log(`[DEV] Invite for ${toEmail} to join "${orgName}" with code: ${inviteCode}`);
    return;
  }

  await resend.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: `You've been invited to join ${orgName} on RejectMap`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #111; margin-bottom: 8px;">You're invited to RejectMap</h2>
        <p style="color: #555; margin-bottom: 8px;">
          <strong>${inviterEmail}</strong> has invited you to join <strong>${orgName}</strong> on RejectMap — a manufacturing parts rejection and rework tracker.
        </p>
        <p style="color: #555; margin-bottom: 24px;">Use the invite code below when you sign up:</p>
        <div style="background:#f4f4f5; border-radius:8px; padding:16px 24px; text-align:center; margin-bottom:24px;">
          <span style="font-family:monospace; font-size:24px; font-weight:700; letter-spacing:4px; color:#111;">${inviteCode}</span>
        </div>
        <a href="${joinUrl}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:600;">
          Join Organisation
        </a>
        <p style="color:#999; font-size:13px; margin-top:24px;">
          If you weren't expecting this invite, you can safely ignore this email.
        </p>
        <hr style="border:none; border-top:1px solid #eee; margin:24px 0;" />
        <p style="color:#aaa; font-size:12px;">RejectMap — Manufacturing parts rejection tracker</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(toEmail: string, token: string): Promise<void> {
  const resetUrl = `${getAppUrl()}/?reset_token=${token}`;

  if (!resend) {
    console.log(`[DEV] Password reset link for ${toEmail}: ${resetUrl}`);
    return;
  }

  const fromAddress = getFromAddress();

  console.log(`[email] Sending password reset to ${toEmail}`);

  const result = await resend.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: "Reset your RejectMap password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #111; margin-bottom: 8px;">Reset your password</h2>
        <p style="color: #555; margin-bottom: 24px;">
          We received a request to reset the password for your RejectMap account (<strong>${toEmail}</strong>).
          Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetUrl}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:600;">
          Reset Password
        </a>
        <p style="color:#999; font-size:13px; margin-top:24px;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border:none; border-top:1px solid #eee; margin:24px 0;" />
        <p style="color:#aaa; font-size:12px;">RejectMap — Manufacturing parts rejection tracker</p>
      </div>
    `,
  });

  if (result.error) {
    console.error(`[email] Resend error for ${toEmail}:`, result.error);
    throw new Error(`Failed to send reset email: ${result.error.message}`);
  }

  console.log(`[email] Password reset sent to ${toEmail} (id: ${result.data?.id})`);
}
