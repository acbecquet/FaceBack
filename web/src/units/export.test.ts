import { saveImageToDevice } from "./export";

test("saveImageToDevice sets the anchor href/download, clicks, and revokes the url", () => {
  const events: string[] = [];
  const anchorEl: Partial<HTMLAnchorElement> = {
    href: "",
    download: "",
    click() {
      events.push(`click:${(this as any).download}:${(this as any).href}`);
    },
  };

  const blob = new Blob(["x"], { type: "image/jpeg" });
  saveImageToDevice(blob, "back-of-head.jpg", {
    anchor: () => anchorEl as HTMLAnchorElement,
    createUrl: () => "blob:fake-url",
    revokeUrl: (u) => events.push(`revoke:${u}`),
  });

  expect(anchorEl.download).toBe("back-of-head.jpg");
  expect(anchorEl.href).toBe("blob:fake-url");
  expect(events).toContain("click:back-of-head.jpg:blob:fake-url");
  expect(events).toContain("revoke:blob:fake-url");
});
