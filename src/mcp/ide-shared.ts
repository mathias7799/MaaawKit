export interface IdeMcpSurfaceOptions {
  cwd: string;
  clientName: () => string;
  writeModeAllowed: () => boolean;
}

export function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

export function jsonResource(uri: string, value: unknown) {
  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) }],
  };
}
