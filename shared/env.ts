export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  KEY_ENC_SECRET: string;
  SESSION_SECRET: string;
  RESEND_API_KEY: string;
}
