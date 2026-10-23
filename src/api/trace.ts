import type { AxiosRequestConfig } from 'axios'
import api from './request'

/**
 * Execution trace REST client.
 *
 * Wire contract: `admin/presentation/observability/trace_controller.cpp`
 * (`GET /v1/jobs/{jobId}/trace` plus `/observations`, `/parts`, `/links`,
 * `/protocol`). The DTOs below reproduce the serialized fields exactly:
 *
 * - `executionKind`, category/phase/quality/coverage/state/link vocabularies are
 *   lowerCamelCase (or PascalCase where the enum itself is spelled that way);
 *   `source.component` is `Admin|Audit|Storage`; `eventType` names are
 *   PascalCase; the summary `job.status` / `job.errorCode` are raw C++ enum
 *   names (`Pending`, `None`, ...).
 * - Every `uint64` count, block range or metric stays an exact decimal
 *   `string`; only bounded ordinals and page fields are `number`.
 * - `recordedAtMs` is the Admin recording clock; `eventTimeMs` is the source
 *   clock (absent when the source did not record one).
 * - Enum-valued fields the backend cannot name are JSON `null`, so they are
 *   `| null` here instead of being defaulted.
 * - A part's `windows` is omitted (not an empty array) unless the request asked
 *   for window state.
 * - Links and protocol events never carry payloads, signatures or free text.
 *
 * Errors are never converted into an empty page: a transport/HTTP failure and
 * a malformed request both reject the returned promise.
 */

/** Exact decimal `uint64` as serialized by the backend (`toDecimalString`). */
export type TraceUint64 = string

// ── Closed wire vocabularies ──

export type TraceExecutionKind =
  | 'tagGeneration'
  | 'challengeProof'
  | 'identityVerification'
  | 'other'
  | 'maintenance'

/** Durable Job status; the summary exposes the raw enum name. */
export type TraceJobStatus = 'Pending' | 'Running' | 'Succeeded' | 'Failed'

/** Durable Job error code; the summary exposes the raw enum name. */
export type TraceJobErrorCode =
  | 'None'
  | 'Cancelled'
  | 'InternalError'
  | 'Timeout'
  | 'NotFound'
  | 'InvalidInput'

export type TraceObservationCategory =
  | 'trace'
  | 'task'
  | 'layout'
  | 'part'
  | 'protocol'
  | 'challenge'
  | 'identity'

export type TraceObservationPhase =
  | 'plan'
  | 'dispatch'
  | 'generate'
  | 'persist'
  | 'verify'
  | 'settle'

export type TraceSourceComponent = 'Admin' | 'Audit' | 'Storage'

export type TraceSourceQuality = 'observed' | 'reconstructed'

/**
 * How much of a scope the observation layer can account for.
 * `expired` has no producer at the current schema version but is part of the
 * closed contract and must stay representable.
 */
export type TraceCoverageState =
  | 'complete'
  | 'partial'
  | 'unavailable'
  | 'expired'
  | 'notInstrumented'

/** Closed, non-sensitive coverage reason codes. */
export type TraceCoverageReason =
  | 'ProtocolEventRetentionCutoff'
  | 'TaskBookTerminalPruning'
  | 'TaskHistoryUnavailable'
  | 'WorkerTelemetryDisabled'
  | 'WorkerStageNotInstrumented'
  | 'PeerCorrelationUnavailable'
  | 'NodeIdentityUnverified'
  | 'ObservationQueueSaturated'
  | 'ObservationWriteFailed'
  | 'SourceRecordUnavailable'
  | 'ClockSkewDetected'
  | 'TraceReconstructed'
  | 'JobMetadataIncomplete'
  | 'ProtocolPacketUnavailable'
  | 'DispatchAcknowledgementUnverified'

export type TraceIdentityScope = 'cell' | 'row' | 'table'

/** Closed NodeAction values serialized on TaskDispatch and ProtocolPacket links. */
export type TraceNodeAction =
  | 'TagDump'
  | 'InitiateChallenge'
  | 'ChallengeStart'
  | 'TagRangeQuery'
  | 'ProofReturn'
  | 'TagDeleteByAlgorithm'
  | 'IdentityVerification'
  | 'SignatureStorage'
  | 'MaintainAudit'
  | 'MaintenanceWriteGuard'

export type TraceAlgorithmSelectionMode = 'Automatic' | 'Explicit' | 'SystemInherited'

export type TraceObservationEventType =
  | 'ExecutionTraceCreated'
  | 'JobStatusObserved'
  | 'TaskRegistered'
  | 'RemoteDispatchRecorded'
  | 'RemoteDispatchAcknowledged'
  | 'RemoteTaskCompleted'
  | 'ExecutionTraceSettled'
  | 'AlgorithmSelectionResolved'
  | 'TagLayoutPlanningStarted'
  | 'TagLayoutPlanned'
  | 'TagRangeQueryDispatched'
  | 'TagRangeQueryCompleted'
  | 'TagGenerationPlanCommitted'
  | 'TagPartGenerationStarted'
  | 'TagWindowGenerated'
  | 'TagWindowFailed'
  | 'TagWindowCancelled'
  | 'TagDumpDispatched'
  | 'TagDumpAccounted'
  | 'TagPartCompleted'
  | 'TagGenerationFinalized'
  | 'ChallengeTagRangesQueried'
  | 'ChallengeDispatchAccepted'
  | 'ChallengeMaterialGenerated'
  | 'ChallengeDeliveredToStorage'
  | 'ProofGenerationStarted'
  | 'ProofGenerationCompleted'
  | 'ProofReturnedToAudit'
  | 'ProofVerificationCompleted'
  | 'IdentityOwnersResolved'
  | 'IdentityEvidenceValidated'
  | 'IdentityAlgorithmResolved'
  | 'IdentitySignaturesAggregated'
  | 'IdentityDispatchAccepted'
  | 'IdentityVerificationCompleted'
  | 'ChallengeSamplingDecided'
  | 'ChallengeJobCompleted'
  | 'MaintenanceRecoveryRequested'
  | 'MaintenanceRecoveryRefused'

export type TraceObservationOutcome = 'succeeded' | 'failed' | 'cancelled' | 'timedOut'

/** Status recorded on a `JobStatusObserved` observation (lowercase vocabulary). */
export type TraceObservedJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export type TraceObservedJobErrorCode =
  | 'none'
  | 'cancelled'
  | 'internalError'
  | 'timeout'
  | 'notFound'
  | 'invalidInput'

/** Safe scalar metric keys; values are exact decimal strings. */
export type TraceObservationMetricKey =
  | 'unitCount'
  | 'blockCount'
  | 'blockSize'
  | 'rangeCount'
  | 'plannedPartCount'
  | 'plannedConcurrency'
  | 'plannedWindowCount'
  | 'generatedCount'
  | 'persistedCount'
  | 'duplicateCount'
  | 'replacedCount'
  | 'completedPartCount'
  | 'totalBlockCount'
  | 'verifiedCount'
  | 'tagCount'
  | 'challengedTagCount'
  | 'challengeCount'
  | 'rootHashPresentCount'
  | 'ownerCount'
  | 'signatureCount'
  | 'ownerRootHashCount'

export type TraceObservationMetrics = Partial<Record<TraceObservationMetricKey, TraceUint64>>

export type TracePartState =
  | 'planned'
  | 'running'
  | 'generated'
  | 'persisted'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TraceWindowState = 'planned' | 'generating' | 'persisted' | 'failed' | 'cancelled'

export type TraceLinkKind =
  | 'taskDispatch'
  | 'taskCompletion'
  | 'protocolPacket'
  | 'peerCorrelation'
  | 'jobParentChild'

export type TraceLinkMatchBasis =
  | 'taskBook'
  | 'requestId'
  | 'packetCorrelation'
  | 'peerCorrelation'
  | 'unknown'
  | 'jobMetadata'

export type TraceLinkConfidence = 'exact' | 'partial'

export type TraceProtocolDirection = 'unknown' | 'inbound' | 'outbound'

/** One of the `MatrixMessageType` enum names. */
export type TraceProtocolMessageType =
  | 'NodeRegisterReq'
  | 'NodeRegisterAck'
  | 'NodeStateReport'
  | 'NodeStateReportAck'
  | 'NodeDrainReq'
  | 'NodeDrainAck'
  | 'NodeResumeReq'
  | 'NodeResumeAck'
  | 'TaskDispatchReq'
  | 'TaskDispatchAck'
  | 'TaskCancelReq'
  | 'TaskCancelAck'
  | 'TaskCompleteReport'
  | 'TaskCompleteAck'
  | 'LeaseRenewReq'
  | 'LeaseRenewAck'
  | 'NodeToNodeReq'
  | 'NodeToNodeAck'
  | 'ErrorReport'
  | 'GenericAck'
  | 'ExecutionTelemetryReport'

// ── Summary ──

export interface TraceCoverage {
  job: TraceCoverageState | null
  tasks: TraceCoverageState | null
  parts: TraceCoverageState | null
  protocol: TraceCoverageState | null
  workerStages: TraceCoverageState | null
  reasons: TraceCoverageReason[]
}

/**
 * Durable user reference. No display-name source exists on the backend yet, so
 * `userName` is `null` and `nameSource` is `'unresolved'`.
 */
export interface TraceUserReference {
  userId: string
  userName: string | null
  nameSource: string
}

export interface TraceSummaryReferences {
  owner: TraceUserReference | null
  initiator: TraceUserReference | null
  algorithmId: string | null
  tableId: string | null
  /** Always absent at this baseline; no safe summary source exists. */
  storageNodeId: string | null
  verifyType: TraceIdentityScope | null
  columnId: string | null
  verified: boolean | null
  rootHashPresent: boolean | null
  ownerCount: TraceUint64 | null
  ownerRootHashCount: TraceUint64 | null
}

/**
 * Progress counters. Each value is present only when a source recorded it;
 * absence is `null` and never means zero.
 */
export interface TraceSummaryProgress {
  plannedPartCount: TraceUint64 | null
  completedPartCount: TraceUint64 | null
  plannedBlockCount: TraceUint64 | null
  generatedBlockCount: TraceUint64 | null
  storageAccountedTagCount: TraceUint64 | null
  persistedCount: TraceUint64 | null
  duplicateCount: TraceUint64 | null
  replacedCount: TraceUint64 | null
}


/** Immutable algorithm selection captured for this Job's execution. */
export interface TraceAlgorithmSelection {
  mode: TraceAlgorithmSelectionMode | null
  algorithmId: string
  algorithmName: string | null
  algorithmType: string | null
  purpose: string | null
  profileVersion: number | null
  strategyVersion: string | null
  strategyKind: string | null
  capabilitiesMask: number | null
  capabilities: string[] | null
  stateMaintenanceParty: string | null
  selectedAtMs: number | null
}

export interface TraceSummary {
  schemaVersion: number
  /** `job:` + jobId. */
  executionTraceId: string
  jobId: string
  executionKind: TraceExecutionKind | null
  job: {
    status: TraceJobStatus
    errorCode: TraceJobErrorCode
    createdAtMs: number | null
    endedAtMs: number | null
  }
  /** Present only when the backend has a valid immutable execution snapshot. */
  algorithmSelection?: TraceAlgorithmSelection | null
  references: TraceSummaryReferences
  progress: TraceSummaryProgress
  coverage: TraceCoverage
  /** Latest actual observation `recordedAtMs`, on the Admin clock. */
  observedAtMs: number | null
}

// ── Observations ──

export interface TraceObservation {
  schemaVersion: number
  observationId: string
  executionTraceId: string
  jobId: string
  eventType: TraceObservationEventType
  category: TraceObservationCategory | null
  phase: TraceObservationPhase | null
  source: {
    component: TraceSourceComponent | null
    nodeId: string | null
    quality: TraceSourceQuality | null
  }
  refs: {
    taskId: string | null
    requestId: string | null
    challengeCorrelationId?: string | null
    packetId: string | null
    operationId: string | null
    algorithmId: string | null
    partIndex: number | null
    windowIndex: number | null
    identityScope?: TraceIdentityScope | null
    algorithmType?: string | null
    attempt: number | null
  }
  /** Source clock; absent when the source recorded no time. */
  eventTimeMs: number | null
  /** Admin recording clock. */
  recordedAtMs: number
  metrics: TraceObservationMetrics
  coverage: TraceCoverageState | null
  outcome: TraceObservationOutcome | null
  job: {
    status: TraceObservedJobStatus | null
    errorCode: TraceObservedJobErrorCode | null
    statusSequence: TraceUint64 | null
  } | null
}

export interface TraceObservationsPage {
  /** Ordered by `(recordedAtMs, observationId)`. */
  items: TraceObservation[]
  /** Opaque continuation; may stay present when `hasMore` is false. */
  nextCursor: string | null
  hasMore: boolean
  /** Declared consistency of the cursor, currently `'eventual'`. */
  cursorConsistency: string
}

// ── Parts ──

export interface TracePartRange {
  blockStart: TraceUint64
  blockCount: TraceUint64
}

export interface TracePartWindow {
  windowIndex: number
  blockStart: TraceUint64
  blockCount: TraceUint64
  state: TraceWindowState | null
  tagDumpTaskId: string | null
}

export interface TracePart {
  jobId: string
  partIndex: number
  attempt: number | null
  ranges: TracePartRange[]
  plannedBlockCount: TraceUint64
  status: TracePartState | null
  generateTaskId: string | null
  /** Omitted entirely unless the request set `includeWindows`. */
  windows?: TracePartWindow[]
  generatedBlockCount: TraceUint64 | null
  storageAccountedTagCount: TraceUint64 | null
  updatedAtMs: number | null
  coverage: TraceCoverageState | null
}

export interface TracePartsPage {
  /** Ordered by `(partIndex, attempt)`. */
  items: TracePart[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  coverage: TraceCoverageState | null
}

// ── Links ──

export interface TraceLinksPage {
  /** Ordered by `linkKey`. */
  items: TraceLink[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface TraceLink {
  jobId: string
  linkKey: string
  linkKind: TraceLinkKind | null
  matchBasis: TraceLinkMatchBasis | null
  confidence: TraceLinkConfidence | null
  sourceQuality: TraceSourceQuality | null
  sourceRef: string
  taskId: string | null
  nodeId: string | null
  originNodeId: string | null
  requestId: string | null
  dispatchPacketId: string | null
  correlationId: string | null
  peerConversationId: string | null
  operationId: string | null
  relatedJobId: string | null
  attempt: number | null
  observedAtMs: number | null
  nodeAction?: TraceNodeAction | null
  /** Inbound Audit route envelope; never a persisted ProofReturn packet. */
  originPacketId?: string | null
}

// ── Protocol ──

/**
 * Safe header projection of one linked persisted protocol event. No payload,
 * authentication/session/signature extension, free-form status text or
 * envelope `traceId` is exposed.
 */
export interface TraceProtocolEvent {
  nodeId: string
  packetId: string
  messageType: TraceProtocolMessageType
  sourceRef: string
  timestampMs: number | null
  authenticatedNodeId: string | null
  fromNodeId: string | null
  toNodeId: string | null
  correlationId: string | null
  direction: TraceProtocolDirection
  matchBasis: TraceLinkMatchBasis | null
  confidence: TraceLinkConfidence | null
  sourceQuality: TraceSourceQuality | null
}

export interface TraceProtocolPage {
  /** Ordered by `(timestampMs, nodeId, packetId)`. */
  items: TraceProtocolEvent[]
  nextCursor: string | null
  hasMore: boolean
  coverage: TraceCoverageState | null
  reasons: TraceCoverageReason[]
}

// ── Requests ──

export interface TraceRequestOptions {
  /** Aborts the request, e.g. on page unmount. */
  signal?: AbortSignal
  /**
   * Suppresses the global API error modal for this request. The promise still
   * rejects; callers that need a page-level error keep receiving it.
   */
  silent?: boolean
}

export interface TraceObservationsQuery {
  /** Cursor page size; integer in `[1, 200]`. Backend default 100. */
  pageSize?: number
  cursor?: string
  category?: TraceObservationCategory
  partIndex?: number
}

export interface TracePartsQuery {
  /** 1-based page number, positive integer. */
  page?: number
  /** Integer in `[1, 200]`. Backend default 100. */
  pageSize?: number
  /** Requests per-window state; defaults to false and omits `windows`. */
  includeWindows?: boolean
}

export interface TraceLinksQuery {
  page?: number
  pageSize?: number
  nodeId?: string
}

export interface TraceProtocolQuery {
  /** Cursor page size; integer in `[1, 200]`. Backend default 100. */
  pageSize?: number
  cursor?: string
  /** Serialized as a comma-separated list of message type names. */
  messageTypes?: TraceProtocolMessageType[]
}

const MAX_TRACE_PAGE_SIZE = 200
const MAX_TRACE_CURSOR_LENGTH = 8192
const MAX_TRACE_PART_INDEX = 2147483647

const OBSERVATION_CATEGORIES: Record<TraceObservationCategory, true> = {
  trace: true,
  task: true,
  layout: true,
  part: true,
  protocol: true,
  challenge: true,
  identity: true,
}

const PROTOCOL_MESSAGE_TYPES: Record<TraceProtocolMessageType, true> = {
  NodeRegisterReq: true,
  NodeRegisterAck: true,
  NodeStateReport: true,
  NodeStateReportAck: true,
  NodeDrainReq: true,
  NodeDrainAck: true,
  NodeResumeReq: true,
  NodeResumeAck: true,
  TaskDispatchReq: true,
  TaskDispatchAck: true,
  TaskCancelReq: true,
  TaskCancelAck: true,
  TaskCompleteReport: true,
  TaskCompleteAck: true,
  LeaseRenewReq: true,
  LeaseRenewAck: true,
  NodeToNodeReq: true,
  NodeToNodeAck: true,
  ErrorReport: true,
  GenericAck: true,
  ExecutionTelemetryReport: true,
}

export function validateTracePageSize(pageSize: number | undefined): number | undefined {
  if (pageSize === undefined) return undefined
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_TRACE_PAGE_SIZE) {
    throw new RangeError(`pageSize must be an integer in [1, ${MAX_TRACE_PAGE_SIZE}]`)
  }
  return pageSize
}

export function validateTracePage(page: number | undefined): number | undefined {
  if (page === undefined) return undefined
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('page must be a positive safe integer')
  }
  return page
}

export function validateTracePartIndex(partIndex: number | undefined): number | undefined {
  if (partIndex === undefined) return undefined
  if (!Number.isSafeInteger(partIndex) || partIndex < 0 || partIndex > MAX_TRACE_PART_INDEX) {
    throw new RangeError(`partIndex must be an integer in [0, ${MAX_TRACE_PART_INDEX}]`)
  }
  return partIndex
}

export function validateTraceObservationCategory(category: TraceObservationCategory | undefined): TraceObservationCategory | undefined {
  if (category === undefined) return undefined
  if (!Object.prototype.hasOwnProperty.call(OBSERVATION_CATEGORIES, category)) {
    throw new TypeError('category must be a known observation category')
  }
  return category
}

export function validateTraceCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined
  if (typeof cursor !== 'string') throw new TypeError('cursor must be a string')
  if (cursor.length === 0) return undefined
  if (cursor.length > MAX_TRACE_CURSOR_LENGTH) {
    throw new RangeError(`cursor must not exceed ${MAX_TRACE_CURSOR_LENGTH} characters`)
  }
  return cursor
}

export function validateTraceNodeId(nodeId: string | undefined): string | undefined {
  if (nodeId === undefined) return undefined
  if (typeof nodeId !== 'string' || nodeId.length === 0) throw new TypeError('nodeId must not be empty')
  return nodeId
}

export function validateTraceIncludeWindows(includeWindows: boolean | undefined): boolean {
  if (includeWindows === undefined) return false
  if (typeof includeWindows !== 'boolean') throw new TypeError('includeWindows must be a boolean')
  return includeWindows
}

export function validateTraceProtocolMessageTypes(
  messageTypes: TraceProtocolMessageType[] | undefined,
): TraceProtocolMessageType[] | undefined {
  if (messageTypes === undefined) return undefined
  if (!Array.isArray(messageTypes)) throw new TypeError('messageTypes must be an array')
  for (const messageType of messageTypes) {
    if (!Object.prototype.hasOwnProperty.call(PROTOCOL_MESSAGE_TYPES, messageType)) {
      throw new TypeError(`Unknown protocol message type: ${String(messageType)}`)
    }
  }
  return messageTypes
}

function traceUrl(jobId: string, suffix = ''): string {
  if (typeof jobId !== 'string' || jobId.length === 0) {
    throw new TypeError('jobId must be a non-empty string')
  }
  return `/v1/jobs/${encodeURIComponent(jobId)}/trace${suffix}`
}

type TraceQueryParams = Record<string, string | number>

function requestConfig(
  params: TraceQueryParams,
  options?: TraceRequestOptions,
): AxiosRequestConfig {
  const config: AxiosRequestConfig & { _silent?: boolean } = { params }
  if (options?.signal !== undefined) config.signal = options.signal
  // Only the axios request config may carry `_silent`; the response
  // interceptor checks it and still rejects the promise.
  if (options?.silent === true) config._silent = true
  return config
}

// The clients are async so that request validation surfaces as a rejection
// rather than a synchronous throw a `.catch` would miss, and the response
// interceptor already unwraps `response.data`, so the body type is passed as
// both axios generics instead of `AxiosResponse<T>`.
export async function getTraceSummary(
  jobId: string,
  options?: TraceRequestOptions,
): Promise<TraceSummary> {
  return api.get<TraceSummary, TraceSummary>(traceUrl(jobId), requestConfig({}, options))
}

export async function getTraceObservations(
  jobId: string,
  params: TraceObservationsQuery = {},
  options?: TraceRequestOptions,
): Promise<TraceObservationsPage> {
  const query: TraceQueryParams = {}
  const pageSize = validateTracePageSize(params.pageSize)
  const cursor = validateTraceCursor(params.cursor)
  const category = validateTraceObservationCategory(params.category)
  const partIndex = validateTracePartIndex(params.partIndex)
  if (pageSize !== undefined) query.pageSize = pageSize
  if (cursor !== undefined) query.cursor = cursor
  if (category !== undefined) query.category = category
  if (partIndex !== undefined) query.partIndex = partIndex
  return api.get<TraceObservationsPage, TraceObservationsPage>(traceUrl(jobId, '/observations'), requestConfig(query, options))
}

export async function getTraceParts(
  jobId: string,
  params: TracePartsQuery = {},
  options?: TraceRequestOptions,
): Promise<TracePartsPage> {
  const query: TraceQueryParams = {}
  const page = validateTracePage(params.page)
  const pageSize = validateTracePageSize(params.pageSize)
  const includeWindows = validateTraceIncludeWindows(params.includeWindows)
  if (page !== undefined) query.page = page
  if (pageSize !== undefined) query.pageSize = pageSize
  // Default is false; only ask for window state when explicitly requested.
  if (includeWindows) query.includeWindows = 'true'
  return api.get<TracePartsPage, TracePartsPage>(traceUrl(jobId, '/parts'), requestConfig(query, options))
}

export async function getTraceLinks(
  jobId: string,
  params: TraceLinksQuery = {},
  options?: TraceRequestOptions,
): Promise<TraceLinksPage> {
  const query: TraceQueryParams = {}
  const page = validateTracePage(params.page)
  const pageSize = validateTracePageSize(params.pageSize)
  const nodeId = validateTraceNodeId(params.nodeId)
  if (page !== undefined) query.page = page
  if (pageSize !== undefined) query.pageSize = pageSize
  if (nodeId !== undefined) query.nodeId = nodeId
  return api.get<TraceLinksPage, TraceLinksPage>(traceUrl(jobId, '/links'), requestConfig(query, options))
}

export async function getTraceProtocol(
  jobId: string,
  params: TraceProtocolQuery = {},
  options?: TraceRequestOptions,
): Promise<TraceProtocolPage> {
  const query: TraceQueryParams = {}
  const pageSize = validateTracePageSize(params.pageSize)
  const cursor = validateTraceCursor(params.cursor)
  const messageTypes = validateTraceProtocolMessageTypes(params.messageTypes)
  if (pageSize !== undefined) query.pageSize = pageSize
  if (cursor !== undefined) query.cursor = cursor
  if (messageTypes && messageTypes.length > 0) {
    query.messageTypes = messageTypes.join(',')
  }
  return api.get<TraceProtocolPage, TraceProtocolPage>(traceUrl(jobId, '/protocol'), requestConfig(query, options))
}
