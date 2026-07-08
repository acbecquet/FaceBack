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
      if (!res.ok) throw new Error(`Resend send failed: ${res.status}`);
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
