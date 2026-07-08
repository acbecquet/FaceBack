export function saveImageToDevice(
  blob: Blob,
  filename: string,
  deps: {
    anchor?: () => HTMLAnchorElement;
    createUrl?: (b: Blob) => string;
    revokeUrl?: (u: string) => void;
  } = {},
): void {
  const anchor = deps.anchor ?? (() => document.createElement("a"));
  const createUrl = deps.createUrl ?? ((b) => URL.createObjectURL(b));
  const revokeUrl = deps.revokeUrl ?? ((u) => URL.revokeObjectURL(u));

  const url = createUrl(blob);
  const a = anchor();
  a.href = url;
  a.download = filename;
  a.click();
  revokeUrl(url);
}
