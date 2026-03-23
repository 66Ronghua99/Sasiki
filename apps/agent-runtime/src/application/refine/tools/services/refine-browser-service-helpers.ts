export function readScreenshotEvidenceRef(args: Record<string, unknown>): string | undefined {
  for (const key of ["filename", "path", "filePath"] as const) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
