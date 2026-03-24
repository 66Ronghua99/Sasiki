import type { ToolClient } from "../../../../contracts/tool-client.js";
import type { ObservationReadiness } from "../../../../domain/refine-react.js";
import { RefineBrowserSnapshotParser, type ParsedObservationMetadata, type SnapshotMetrics } from "../../refine-browser-snapshot-parser.js";

export interface StabilizedObservationSample {
  readonly snapshot: string;
  readonly metadata: ParsedObservationMetadata;
  readonly frontierSignature: string;
  readonly contentFingerprint: string;
}

interface StabilizedObservationSampleWithReadiness extends StabilizedObservationSample {
  readonly readiness: ObservationReadiness;
}

export interface ObservationStabilizerSettings {
  readonly preGateWaitSeconds: number;
  readonly overallDeadlineMs: number;
  readonly settleSampleLimit: number;
}

const DEFAULT_STABILIZER_SETTINGS: ObservationStabilizerSettings = {
  preGateWaitSeconds: 1.5,
  overallDeadlineMs: 3000,
  settleSampleLimit: 3,
};

const DEADLINE_EXCEEDED = Symbol("stabilization_deadline_exceeded");

export async function captureStabilizedObservation(
  rawClient: ToolClient,
  parser: RefineBrowserSnapshotParser,
  settings: Partial<ObservationStabilizerSettings> = {},
): Promise<StabilizedObservationSampleWithReadiness> {
  const resolvedSettings = resolveSettings(settings);
  await runPreGateWait(rawClient, resolvedSettings);

  const deadlineAt = Date.now() + resolvedSettings.overallDeadlineMs;
  const samples: StabilizedObservationSample[] = [];
  let previousSample: StabilizedObservationSample | undefined;

  for (let attempt = 0; attempt < resolvedSettings.settleSampleLimit; attempt += 1) {
    const sample = await captureSnapshotSampleBeforeDeadline(rawClient, parser, deadlineAt);
    if (sample === DEADLINE_EXCEEDED) {
      break;
    }
    if (!sample) {
      continue;
    }
    samples.push(sample);
    if (previousSample && hasConverged(previousSample, sample) && canMarkObservationReady(sample.metadata)) {
      return {
        ...sample,
        readiness: "ready",
      };
    }
    previousSample = sample;
  }

  const bestSample = selectBestObservation(samples, samples.at(-1)?.frontierSignature);
  if (!bestSample) {
    throw new Error("browser_snapshot failed to produce a stabilized observation");
  }

  return {
    ...bestSample,
    readiness: "incomplete",
  };
}

function canMarkObservationReady(metadata: ParsedObservationMetadata): boolean {
  return !metadata.pageIdentityWasRepaired;
}

function resolveSettings(settings: Partial<ObservationStabilizerSettings>): ObservationStabilizerSettings {
  return {
    preGateWaitSeconds:
      typeof settings.preGateWaitSeconds === "number" && settings.preGateWaitSeconds >= 0
        ? settings.preGateWaitSeconds
        : DEFAULT_STABILIZER_SETTINGS.preGateWaitSeconds,
    overallDeadlineMs:
      typeof settings.overallDeadlineMs === "number" && settings.overallDeadlineMs > 0
        ? Math.floor(settings.overallDeadlineMs)
        : DEFAULT_STABILIZER_SETTINGS.overallDeadlineMs,
    settleSampleLimit:
      typeof settings.settleSampleLimit === "number" && settings.settleSampleLimit > 0
        ? Math.floor(settings.settleSampleLimit)
        : DEFAULT_STABILIZER_SETTINGS.settleSampleLimit,
  };
}

async function runPreGateWait(rawClient: ToolClient, settings: ObservationStabilizerSettings): Promise<void> {
  try {
    const tools = await rawClient.listTools();
    if (!tools.some((tool) => tool.name === "browser_wait_for")) {
      return;
    }
    await rawClient.callTool("browser_wait_for", {
      time: settings.preGateWaitSeconds,
    });
  } catch {
    return;
  }
}

async function captureSnapshotSampleBeforeDeadline(
  rawClient: ToolClient,
  parser: RefineBrowserSnapshotParser,
  deadlineAt: number,
): Promise<StabilizedObservationSample | typeof DEADLINE_EXCEEDED | undefined> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    return DEADLINE_EXCEEDED;
  }
  try {
    const snapshotResult = await raceAgainstDeadline(rawClient.callTool("browser_snapshot", {}), remainingMs);
    if (snapshotResult === DEADLINE_EXCEEDED) {
      return DEADLINE_EXCEEDED;
    }
    if (snapshotResult && typeof snapshotResult === "object" && (snapshotResult as { isError?: boolean }).isError === true) {
      throw new Error(`browser_snapshot returned an error: ${readToolText(snapshotResult)}`);
    }
    const snapshotText = readToolText(snapshotResult);
    if (isFailureText(snapshotText)) {
      throw new Error(`browser_snapshot returned an error: ${snapshotText}`);
    }
    const metadata = parser.parseObservationMetadata(snapshotText);
    return {
      snapshot: snapshotText,
      metadata,
      frontierSignature: buildFrontierSignature(metadata),
      contentFingerprint: buildSnapshotContentFingerprint(parser, snapshotText),
    };
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      return DEADLINE_EXCEEDED;
    }
    throw error;
  }
}

function hasConverged(previous: StabilizedObservationSample, current: StabilizedObservationSample): boolean {
  return (
    samePageIdentity(previous.metadata.page, current.metadata.page) &&
    sameTabIdentity(previous.metadata.pageTab, current.metadata.pageTab) &&
    previous.metadata.activeTabIndex === current.metadata.activeTabIndex &&
    previous.metadata.activeTabMatchesPage === current.metadata.activeTabMatchesPage &&
    sameSnapshotMetrics(previous.metadata.snapshotMetrics, current.metadata.snapshotMetrics) &&
    previous.contentFingerprint === current.contentFingerprint
  );
}

function selectBestObservation(
  samples: StabilizedObservationSample[],
  preferredFrontierSignature?: string,
): StabilizedObservationSample | undefined {
  const frontierSamples =
    typeof preferredFrontierSignature === "string"
      ? samples.filter((sample) => sample.frontierSignature === preferredFrontierSignature)
      : samples;
  const candidates = frontierSamples.length > 0 ? frontierSamples : samples;

  let bestSample: StabilizedObservationSample | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const sample of candidates) {
    const score = scoreObservation(sample.metadata);
    if (!bestSample || score >= bestScore) {
      bestSample = sample;
      bestScore = score;
    }
  }
  return bestSample;
}

function scoreObservation(metadata: ParsedObservationMetadata): number {
  const metrics = metadata.snapshotMetrics;
  return (
    metrics.refBearingElementCount * 1000 +
    metrics.textBearingLineCount * 100 +
    metrics.snapshotLineCount * 10 +
    metrics.tabCount -
    metrics.changedMarkerCount * 50
  );
}

function buildFrontierSignature(metadata: ParsedObservationMetadata): string {
  return JSON.stringify({
    page: metadata.page ?? null,
    pageTab: metadata.pageTab ?? null,
    activeTabIndex: metadata.activeTabIndex ?? null,
    activeTabMatchesPage: metadata.activeTabMatchesPage ?? null,
  });
}

function buildSnapshotContentFingerprint(parser: RefineBrowserSnapshotParser, snapshotText: string): string {
  return extractSnapshotContentLines(parser, snapshotText)
    .map((line) => line.trimEnd())
    .join("\n");
}

function extractSnapshotContentLines(parser: RefineBrowserSnapshotParser, snapshotText: string): string[] {
  const lines = snapshotText.split("\n");
  const body: string[] = [];
  let inSnapshotSection = false;
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inSnapshotSection) {
      if (/^###\s+Snapshot\b/i.test(trimmed)) {
        inSnapshotSection = true;
      }
      continue;
    }
    if (!inFence) {
      if (trimmed.startsWith("```")) {
        inFence = true;
      }
      continue;
    }
    if (trimmed.startsWith("```")) {
      break;
    }
    body.push(line);
  }

  if (body.length > 0) {
    return body;
  }

  return lines.filter((line) => {
    const trimmed = line.trim();
    return parser.parseSnapshotElements(trimmed).length > 0;
  });
}

function samePageIdentity(left: ParsedObservationMetadata["page"], right: ParsedObservationMetadata["page"]): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.url === right.url &&
    left.origin === right.origin &&
    left.normalizedPath === right.normalizedPath &&
    left.title === right.title
  );
}

function sameTabIdentity(
  left: ParsedObservationMetadata["pageTab"],
  right: ParsedObservationMetadata["pageTab"],
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return (
    left.index === right.index &&
    left.url === right.url &&
    left.title === right.title &&
    left.isActive === right.isActive
  );
}

function sameSnapshotMetrics(left: SnapshotMetrics, right: SnapshotMetrics): boolean {
  return (
    left.snapshotLineCount === right.snapshotLineCount &&
    left.refBearingElementCount === right.refBearingElementCount &&
    left.textBearingLineCount === right.textBearingLineCount &&
    left.changedMarkerCount === right.changedMarkerCount &&
    left.tabCount === right.tabCount
  );
}

async function raceAgainstDeadline<T>(
  operation: Promise<T>,
  remainingMs: number,
): Promise<T | typeof DEADLINE_EXCEEDED> {
  if (remainingMs <= 0) {
    return Promise.resolve(DEADLINE_EXCEEDED);
  }
  return new Promise<T | typeof DEADLINE_EXCEEDED>((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve(DEADLINE_EXCEEDED);
    }, remainingMs);

    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /timeout/i.test(error.name) || /timeout/i.test(error.message) || /timed out/i.test(error.message);
}

function readToolText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object" && Array.isArray((result as { content?: unknown }).content)) {
    for (const block of (result as { content: unknown[] }).content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const text = (block as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) {
        return text;
      }
    }
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function isFailureText(message: string): boolean {
  return /\"isError\"\s*:\s*true/.test(message) || /###\s*Error\b/i.test(message);
}
