import type { Env } from '@/env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface SentMail {
  id: string | null;
}

export interface Mailer {
  send(mail: Mail): Promise<SentMail>;
}

export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];

  async send(mail: Mail): Promise<SentMail> {
    this.sent.push(mail);
    return { id: `memoire-${this.sent.length}` };
  }

  lastLink(to: string): string | null {
    const mail = this.sent.findLast((m) => m.to === to);
    return mail?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
  }
}

class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<SentMail> {
    const replyTo = mail.replyTo ? `\n   Répondre à : ${mail.replyTo}` : '';
    console.info(`\n✉  À : ${mail.to}${replyTo}\n   Objet : ${mail.subject}\n\n${mail.text}\n`);
    return { id: null };
  }
}

function parseFrom(from: string): { name: string; email: string } {
  const match = /^(.*)<(.+)>$/.exec(from.trim());
  return match
    ? { name: (match[1] ?? '').trim(), email: (match[2] ?? '').trim() }
    : { name: '', email: from.trim() };
}

class HttpMailer implements Mailer {
  constructor(
    private readonly provider: 'brevo' | 'resend',
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(mail: Mail): Promise<SentMail> {
    const sender = parseFrom(this.from);
    const request: { url: string; headers: Record<string, string>; body: object } =
      this.provider === 'brevo'
        ? {
            url: 'https://api.brevo.com/v3/smtp/email',
            headers: { 'api-key': this.apiKey },
            body: {
              sender,
              to: [{ email: mail.to }],
              subject: mail.subject,
              textContent: mail.text,
              ...(mail.replyTo && { replyTo: { email: mail.replyTo } }),
            },
          }
        : {
            url: 'https://api.resend.com/emails',
            headers: { authorization: `Bearer ${this.apiKey}` },
            body: {
              from: this.from,
              to: [mail.to],
              subject: mail.subject,
              text: mail.text,
              ...(mail.replyTo && { reply_to: mail.replyTo }),
            },
          };
    const response = await fetch(request.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...request.headers },
      body: JSON.stringify(request.body),
    });
    if (!response.ok) {
      throw new Error(`Envoi d'e-mail refusé par ${this.provider} (${response.status})`);
    }
    const sent = (await response.json().catch(() => ({}))) as { messageId?: unknown; id?: unknown };
    const id = this.provider === 'brevo' ? sent.messageId : sent.id;
    return { id: typeof id === 'string' ? id : null };
  }
}

export function createMailer(
  env: Pick<Env, 'MAIL_PROVIDER' | 'MAIL_API_KEY' | 'MAIL_FROM'>,
): Mailer {
  if (env.MAIL_PROVIDER === 'console') return new ConsoleMailer();
  if (!env.MAIL_API_KEY) throw new Error(`MAIL_API_KEY est obligatoire avec ${env.MAIL_PROVIDER}`);
  return new HttpMailer(env.MAIL_PROVIDER, env.MAIL_API_KEY, env.MAIL_FROM);
}
