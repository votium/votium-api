import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { envs } from 'src/config';
import { OTP_TTL_MS } from 'src/shared/constants/mfa.constants';
import { PASSWORD_RECOVERY_TTL_MS } from 'src/shared/constants/password-recovery.constants';
import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import type { EmailServicePort } from '../../application/ports/email-service.port';
import type { PasswordRecoveryEmailPort } from '../../application/ports/password-recovery-email.port';

type EmailContent = { subject: string; text: string; html: string };

type EmailTemplate = {
  subject: string;
  title: string;
  badge: string;
  intro: string;
  instruction: string;
  code: string;
  validity: string;
  warning: string;
};

const GREETING = 'Hola,';
const SIGN_OFF = 'Saludos,';
const SIGNATURE = 'Equipo de Seguridad de Votium';

const MS_PER_MINUTE = 60_000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderText(t: EmailTemplate): string {
  return [
    GREETING,
    '',
    t.intro,
    '',
    t.instruction,
    '',
    t.code,
    '',
    t.validity,
    '',
    t.warning,
    '',
    SIGN_OFF,
    '',
    SIGNATURE,
  ].join('\n');
}

// Table-based layout with inline styles only (email-client compatible). No images, links,
// remote fonts or scripts. Colors follow the Votium frontend palette.
function renderHtml(t: EmailTemplate): string {
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(t.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f7f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f7f8;">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #dfe0e2;border-radius:8px;">
<tr>
<td style="background-color:#1E3A5F;padding:20px 32px;border-radius:8px 8px 0 0;font-family:${font};font-size:22px;font-weight:bold;color:#ffffff;">Votium</td>
</tr>
<tr>
<td style="padding:32px;font-family:${font};font-size:16px;line-height:1.6;color:#26282b;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#152942;">${e(t.title)}</h1>
<p style="margin:0 0 16px;color:#26282b;">${e(GREETING)}</p>
<p style="margin:0 0 16px;color:#26282b;">${e(t.intro)}</p>
<p style="margin:0 0 24px;color:#26282b;">${e(t.instruction)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
<tr>
<td align="center" style="background-color:#f7f7f8;border:2px solid #C65D2E;border-radius:8px;padding:20px;">
<p style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#C65D2E;">${e(t.badge)}</p>
<p style="margin:0;font-family:'Courier New', Courier, monospace;font-size:32px;font-weight:bold;letter-spacing:8px;color:#152942;">${e(t.code)}</p>
</td>
</tr>
</table>
<p style="margin:0 0 16px;font-size:14px;color:#60656c;">${e(t.validity)}</p>
<p style="margin:0;font-size:14px;color:#60656c;">${e(t.warning)}</p>
</td>
</tr>
<tr>
<td style="padding:20px 32px;border-top:1px solid #dfe0e2;font-family:${font};font-size:14px;line-height:1.6;color:#60656c;">${e(SIGN_OFF)}<br>${e(SIGNATURE)}</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

function render(t: EmailTemplate): EmailContent {
  return { subject: t.subject, text: renderText(t), html: renderHtml(t) };
}

export function buildVerificationEmail(code: string): EmailContent {
  const minutes = OTP_TTL_MS / MS_PER_MINUTE;
  return render({
    subject: 'Código de verificación de Votium',
    title: 'Verifica tu inicio de sesión',
    badge: 'Código de verificación',
    intro: 'Se ha detectado un intento de inicio de sesión en tu cuenta de Votium.',
    instruction: 'Ingresa el siguiente código de verificación para completar tu autenticación:',
    code,
    validity: `Este código es válido por ${minutes} minutos y solo puede usarse una vez.`,
    warning:
      'Si no intentaste iniciar sesión, ignora este correo y contacta al administrador del sistema.',
  });
}

export function buildPasswordRecoveryEmail(code: string): EmailContent {
  const minutes = PASSWORD_RECOVERY_TTL_MS / MS_PER_MINUTE;
  return render({
    subject: 'Código de recuperación de contraseña de Votium',
    title: 'Restablece tu contraseña',
    badge: 'Código de recuperación',
    intro: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta de Votium.',
    instruction:
      'Ingresa el siguiente código de recuperación para establecer una nueva contraseña:',
    code,
    validity: `Este código es válido por ${minutes} minutos y solo puede usarse una vez.`,
    warning:
      'Si no solicitaste restablecer tu contraseña, ignora este correo. Tu contraseña no cambiará.',
  });
}

@Injectable()
export class NodemailerEmailService implements EmailServicePort, PasswordRecoveryEmailPort {
  private readonly logger = new Logger(NodemailerEmailService.name);
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>;

  constructor() {
    this.transporter = createTransport({
      host: envs.smtpHost,
      port: envs.smtpPort,
      secure: envs.smtpSecure,
      auth: {
        user: envs.smtpUser,
        pass: envs.smtpPass,
      },
    });
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const { subject, text, html } = buildVerificationEmail(code);
    try {
      await this.transporter.sendMail({
        from: envs.emailFrom,
        to,
        subject,
        text,
        html,
      });
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error);
      throw new EmailDeliveryException('Unable to send verification email.');
    }
  }

  async sendPasswordRecoveryCode(to: string, code: string): Promise<void> {
    const { subject, text, html } = buildPasswordRecoveryEmail(code);
    try {
      await this.transporter.sendMail({
        from: envs.emailFrom,
        to,
        subject,
        text,
        html,
      });
    } catch (error) {
      this.logger.error(`Failed to send password recovery email to ${to}`, error);
      throw new EmailDeliveryException('Unable to send password recovery email.');
    }
  }
}
