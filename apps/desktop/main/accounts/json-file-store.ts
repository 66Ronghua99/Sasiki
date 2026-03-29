import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function readJsonFile<T>(filePath: string, fallback: () => T): Promise<T> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    if (isMissingFileError(error)) {
      return fallback();
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }

    throw error;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function assertNonEmptyString(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return trimmed;
}
