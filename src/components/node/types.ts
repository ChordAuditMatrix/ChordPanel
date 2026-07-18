// Node list item — GET /api/v1/nodes response
// Note: the list endpoint flattens fields; state/isAvailable/lastSeenAt are pulled up from nested objects
export interface NodeListItem {
  nodeId: string
  nodeInstanceId: string
  role: string
  state: string
  isAvailable: boolean
  lastSeenAt: number
}

// Task failure info
export interface TaskFailure {
  category: string
  code: string
  message: string
  retryable: boolean
  details: Record<string, unknown>
}

// Task assignment — element of NodeDetail.tasks array
export interface NodeTask {
  requestId: string
  taskType: string
  taskOwnerNodeId: string
  jobId: string
  assignedAt: number
  acceptedAt: number
  startedAt: number
  deadlineAt: number
  completedAt: number
  status: string
  resultSummary: Record<string, unknown>
  dataFrameIds: string[]
  failure: TaskFailure
}

// Node connection endpoint
export interface NodeEndpoint {
  host: string
  port: number
  transport: string
  advertiseHost: string
  advertisePort: number
}

// Node capability declaration
export interface NodeCapabilities {
  supportedTaskTypes: string[]
  maxConcurrentTasks: number
  maxFrameSize: number
  maxInFlightRequests: number
  supportsDirectTransfer: boolean
  supportsLease: boolean
  metadata: Record<string, unknown>
}

// Node runtime state
export interface NodeRuntimeState {
  state: string
  stateReason: string
  currentLoad: number
  activeTaskCount: number
  queueDepth: number
  cpuUsage: number
  memoryUsage: number
  lastReportAt: number
}

// Node liveness status
export interface NodeLiveness {
  policyType: string
  lastSeenAt: number
  leaseExpireAt: number
  offlineSince: number
  isAvailable: boolean
  suspectReason: string
}

// Timing policy
export interface TimingPolicy {
  ackTimeout: number
  completionTimeout: number
  maxSkew: number
  offlineRetention: number
  dedupWindow: number
}

// Node detail — GET /api/v1/nodes/{nodeId} response
export interface NodeDetail {
  nodeId: string
  nodeInstanceId: string
  role: string
  endpoint: NodeEndpoint
  capabilities: NodeCapabilities
  runtimeState: NodeRuntimeState
  liveness: NodeLiveness
  tasks: NodeTask[]
  timingPolicy: TimingPolicy
}

export function formatTime(ms?: number): string {
  if (!ms || ms === 0) return '-'
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '-'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
