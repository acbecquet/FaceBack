import { errorResponse } from "./http";

export const FROM_ADDRESS = "faceback@acb-apps.com";

export interface CodeEmail {
  to: string;
  code: string;
  purpose: "auth" | "key";
}

export interface EmailProvider {
  sendCode(email: CodeEmail): Promise<void>;
}

function subjectFor(purpose: CodeEmail["purpose"]): string {
  return purpose === "key" ? "Your FaceBack key access code" : "Your FaceBack sign-in code";
}

function bodyFor(code: string): string {
  return `Your FaceBack code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
}

export class EmailSendError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`Resend send failed: ${status}${detail ? ` ${detail}` : ""}`);
    this.name = "EmailSendError";
  }
}

// Turn a thrown email error into a clear HTTP response. A provider failure
// surfaces as a 502 carrying the provider's own status and message, so an
// operator can see why delivery failed instead of a blank 500. Anything that
// is not an email error is re-thrown unchanged.
export function emailSendErrorResponse(e: unknown): Response {
  if (e instanceof EmailSendError) {
    return errorResponse(
      "email_failed",
      `The code email could not be sent (email provider returned ${e.status}). ${e.detail}`.trim(),
      502,
    );
  }
  throw e;
}

export function createResendProvider(apiKey: string, from: string): EmailProvider {
  return {
    async sendCode({ to, code, purpose }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject: subjectFor(purpose), text: bodyFor(code) }),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 400);
        throw new EmailSendError(res.status, detail);
      }
    },
  };
}

export function createRecordingProvider(): EmailProvider & { sent: CodeEmail[] } {
  const sent: CodeEmail[] = [];
  return {
    sent,
    async sendCode(email) {
      sent.push(email);
    },
  };
}
