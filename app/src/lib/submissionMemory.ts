import type { SubmissionCard } from "./types";

const submissionArtistIdSymbol = Symbol("submissionArtistId");

type SubmissionArtistRecord = {
  artistId: string;
  username: string;
  userUrl?: string;
  userIconUrlSmall?: string;
  userIconUrlMedium?: string;
  userIconUrlLarge?: string;
};

type NormalizedSubmissionCard = SubmissionCard & {
  [submissionArtistIdSymbol]?: string;
};

export type SubmissionMemoryStats = {
  resultCount: number;
  uniqueArtistCount: number;
  uniqueArtistBytes: number;
  normalizedResultBytes: number;
  denormalizedResultBytes: number;
  savedBytes: number;
};

const submissionArtistStore = new Map<string, SubmissionArtistRecord>();
const submissionArtistPrototype = Object.create(Object.prototype, {
  username: {
    get() {
      return getSubmissionArtistRecord(this as SubmissionCard)?.username ?? "";
    },
  },
  userUrl: {
    get() {
      return getSubmissionArtistRecord(this as SubmissionCard)?.userUrl;
    },
  },
  userIconUrlSmall: {
    get() {
      return getSubmissionArtistRecord(this as SubmissionCard)?.userIconUrlSmall;
    },
  },
  userIconUrlMedium: {
    get() {
      return getSubmissionArtistRecord(this as SubmissionCard)?.userIconUrlMedium;
    },
  },
  userIconUrlLarge: {
    get() {
      return getSubmissionArtistRecord(this as SubmissionCard)?.userIconUrlLarge;
    },
  },
});

export function normalizeSubmissionCards(results: SubmissionCard[]) {
  let changed = false;
  const normalized = results.map((result) => {
    const next = normalizeSubmissionCard(result);
    changed = changed || next !== result;
    return next;
  });
  return changed ? normalized : results;
}

export function normalizeSubmissionCard(result: SubmissionCard) {
  if (!result || typeof result !== "object") {
    return result;
  }

  const currentArtistId = (result as NormalizedSubmissionCard)[submissionArtistIdSymbol];
  const artist = readArtistRecord(result);
  if (!artist) {
    return result;
  }

  upsertSubmissionArtistRecord(artist);

  if (
    currentArtistId === artist.artistId &&
    !hasOwnArtistFields(result) &&
    Object.getPrototypeOf(result) === submissionArtistPrototype
  ) {
    return result;
  }

  const next = { ...result } as NormalizedSubmissionCard;
  delete (next as Partial<SubmissionCard>).username;
  delete (next as Partial<SubmissionCard>).userUrl;
  delete (next as Partial<SubmissionCard>).userIconUrlSmall;
  delete (next as Partial<SubmissionCard>).userIconUrlMedium;
  delete (next as Partial<SubmissionCard>).userIconUrlLarge;
  Object.defineProperty(next, submissionArtistIdSymbol, {
    configurable: true,
    enumerable: false,
    value: artist.artistId,
    writable: true,
  });
  Object.setPrototypeOf(next, submissionArtistPrototype);
  return next as SubmissionCard;
}

export function denormalizeSubmissionCards(results: SubmissionCard[]) {
  let changed = false;
  const denormalized = results.map((result) => {
    const next = denormalizeSubmissionCard(result);
    changed = changed || next !== result;
    return next;
  });
  return changed ? denormalized : results;
}

export function denormalizeSubmissionCard(result: SubmissionCard) {
  const artist = getSubmissionArtistRecord(result);
  if (!artist) {
    return result;
  }
  return {
    ...result,
    username: artist.username,
    userUrl: artist.userUrl,
    userIconUrlSmall: artist.userIconUrlSmall,
    userIconUrlMedium: artist.userIconUrlMedium,
    userIconUrlLarge: artist.userIconUrlLarge,
  };
}

export function getSubmissionArtistRecord(result: SubmissionCard) {
  const artistId = (result as NormalizedSubmissionCard)[submissionArtistIdSymbol];
  if (artistId) {
    return submissionArtistStore.get(artistId);
  }
  return readArtistRecord(result);
}

export function getSubmissionArtistStoreStats(results: SubmissionCard[]): SubmissionMemoryStats {
  const artistIds = new Set<string>();
  let normalizedResultBytes = 0;
  let denormalizedResultBytes = 0;

  for (const result of results) {
    normalizedResultBytes += estimateValueBytes(result);
    const denormalized = denormalizeSubmissionCard(result);
    denormalizedResultBytes += estimateValueBytes(denormalized);
    const artistId =
      (result as NormalizedSubmissionCard)[submissionArtistIdSymbol] ??
      readArtistRecord(result)?.artistId;
    if (artistId) {
      artistIds.add(artistId);
    }
  }

  let uniqueArtistBytes = 0;
  for (const artistId of artistIds) {
    uniqueArtistBytes += estimateValueBytes(submissionArtistStore.get(artistId));
  }

  const savedBytes =
    Math.max(denormalizedResultBytes - (normalizedResultBytes + uniqueArtistBytes), 0);

  return {
    resultCount: results.length,
    uniqueArtistCount: artistIds.size,
    uniqueArtistBytes,
    normalizedResultBytes,
    denormalizedResultBytes,
    savedBytes,
  };
}

function readArtistRecord(result: SubmissionCard): SubmissionArtistRecord | null {
  const username = typeof result.username === "string" ? result.username : "";
  const userUrl = typeof result.userUrl === "string" ? result.userUrl : "";
  const small =
    typeof result.userIconUrlSmall === "string" ? result.userIconUrlSmall : "";
  const medium =
    typeof result.userIconUrlMedium === "string" ? result.userIconUrlMedium : "";
  const large =
    typeof result.userIconUrlLarge === "string" ? result.userIconUrlLarge : "";
  const artistId = buildArtistID({
    username,
    userUrl,
    userIconUrlSmall: small,
    userIconUrlMedium: medium,
    userIconUrlLarge: large,
  });

  if (!artistId) {
    return null;
  }

  return {
    artistId,
    username,
    userUrl: userUrl || undefined,
    userIconUrlSmall: small || undefined,
    userIconUrlMedium: medium || undefined,
    userIconUrlLarge: large || undefined,
  };
}

function buildArtistID(record: Omit<SubmissionArtistRecord, "artistId">) {
  const username = record.username.trim().toLowerCase();
  const userUrl = (record.userUrl ?? "").trim().toLowerCase();
  if (!username && !userUrl) {
    return "";
  }
  return userUrl || username;
}

function upsertSubmissionArtistRecord(next: SubmissionArtistRecord) {
  const current = submissionArtistStore.get(next.artistId);
  if (!current) {
    submissionArtistStore.set(next.artistId, next);
    return;
  }
  submissionArtistStore.set(next.artistId, {
    artistId: next.artistId,
    username: current.username || next.username,
    userUrl: current.userUrl || next.userUrl,
    userIconUrlSmall: current.userIconUrlSmall || next.userIconUrlSmall,
    userIconUrlMedium: current.userIconUrlMedium || next.userIconUrlMedium,
    userIconUrlLarge: current.userIconUrlLarge || next.userIconUrlLarge,
  });
}

function hasOwnArtistFields(result: SubmissionCard) {
  return (
    Object.prototype.hasOwnProperty.call(result, "username") ||
    Object.prototype.hasOwnProperty.call(result, "userUrl") ||
    Object.prototype.hasOwnProperty.call(result, "userIconUrlSmall") ||
    Object.prototype.hasOwnProperty.call(result, "userIconUrlMedium") ||
    Object.prototype.hasOwnProperty.call(result, "userIconUrlLarge")
  );
}

function estimateValueBytes(value: unknown): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === "string") {
    return value.length * 2;
  }
  if (typeof value === "number") {
    return 8;
  }
  if (typeof value === "boolean") {
    return 4;
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + estimateValueBytes(item), 0);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (total, item) => total + estimateValueBytes(item),
      0,
    );
  }
  return 0;
}
