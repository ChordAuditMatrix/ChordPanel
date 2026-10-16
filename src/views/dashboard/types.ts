export interface SystemMetricSample {
  observedAtMs: number
  cpuUsage?: number
  memoryUsage?: number
  load?: number
}

export interface MetricPoint {
  observedAtMs: number
  value: number
}
