export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

export function createRecordingEmailProvider(): EmailProvider & {
  sent: Array<{ to: string; subject: string; body: string }>;
} {
  const sent: Array<{ to: string; subject: string; body: string }> = [];
  return {
    sent,
    async send(to, subject, body) {
      sent.push({ to, subject, body });
    },
  };
}
