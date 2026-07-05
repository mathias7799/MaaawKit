export interface IdeMcpSurfaceOptions {
  cwd: string;
  clientName: () => string;
  writeModeAllowed: () => boolean;
}

export function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

export function jsonText(value: unknown) {
  return text(JSON.stringify(value, null, 2));
}

export function errorText(message: string) {
  return { ...text(message), isError: true };
}

export function jsonResource(uri: string, value: unknown) {
  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) }],
  };
}
