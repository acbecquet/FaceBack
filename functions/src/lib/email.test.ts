import { createRecordingEmailProvider } from "./email";

test("the recording provider captures sent messages", async () => {
  const p = createRecordingEmailProvider();
  await p.send("a@b.com", "Your code", "123456");
  expect(p.sent).toEqual([{ to: "a@b.com", subject: "Your code", body: "123456" }]);
});
