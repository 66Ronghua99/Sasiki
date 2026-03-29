export const desktopChannels = {
  accounts: {
    list: "accounts:list",
    upsert: "accounts:upsert",
    launchEmbeddedLogin: "accounts:launchEmbeddedLogin",
    importCookieFile: "accounts:importCookieFile",
    verifyCredential: "accounts:verifyCredential",
  },
  runs: {
    startObserve: "runs:startObserve",
    startCompact: "runs:startCompact",
    startRefine: "runs:startRefine",
    interruptRun: "runs:interruptRun",
    listRuns: "runs:listRuns",
    subscribe: "runs:subscribe",
    events: "runs:event",
  },
  artifacts: {
    openRunArtifacts: "artifacts:openRunArtifacts",
  },
  skills: {
    list: "skills:list",
  },
} as const;
