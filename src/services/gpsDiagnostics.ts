/** Local, staging-only counters. Never accepts coordinates, identity or error text. */
export class GpsDiagnostics {
  private startedAt = Date.now();
  private stoppedAt: number | null = null;
  private requestAt: number | null = null;
  private uploadAt: number | null = null;
  private captureAt: number | null = null;
  private reportAt: number | null = null;
  private requests = 0;
  private responses = 0;
  private freshFixes = 0;
  private repeatedFixes = 0;
  private gpsUploads = 0;
  private uploadErrors = 0;
  private reports = 0;
  private lastRequestMs: number | null = null;
  private lastUploadMs: number | null = null;
  private lastGpsError: number | null = null;
  private connected: boolean | null = null;
  requestStarted() {
    if (this.stoppedAt !== null) return;
    this.requests++;
    this.requestAt = Date.now();
  }
  requestFinished(errorCode?: number) {
    if (this.stoppedAt !== null) return;
    this.responses++;
    this.lastRequestMs =
      this.requestAt === null ? null : Date.now() - this.requestAt;
    this.requestAt = null;
    this.lastGpsError =
      errorCode === undefined
        ? null
        : [1, 2, 3].includes(errorCode)
          ? errorCode
          : 0;
  }
  fix(capturedAt: number, accepted: boolean) {
    if (this.stoppedAt !== null) return;
    if (accepted) {
      this.freshFixes++;
      this.captureAt = capturedAt;
    } else this.repeatedFixes++;
  }
  uploadStarted() {
    if (this.stoppedAt === null) this.uploadAt = Date.now();
  }
  uploadFinished(success: boolean) {
    if (this.stoppedAt !== null) return;
    this.lastUploadMs =
      this.uploadAt === null ? null : Date.now() - this.uploadAt;
    this.uploadAt = null;
    if (success) this.gpsUploads++;
    else this.uploadErrors++;
  }
  reportAcknowledged() {
    if (this.stoppedAt !== null) return;
    this.reports++;
    this.reportAt = Date.now();
  }
  connection(value: boolean) {
    if (this.stoppedAt === null) this.connected = value;
  }
  stop() {
    this.stoppedAt ??= Date.now();
  }
  snapshot() {
    const now = this.stoppedAt ?? Date.now();
    const age = (time: number | null) =>
      time === null ? null : Math.max(0, now - time);
    return {
      elapsedMs: now - this.startedAt,
      stopped: this.stoppedAt !== null,
      firebaseConnected: this.connected,
      requestsStarted: this.requests,
      requestsCompleted: this.responses,
      requestPendingMs: age(this.requestAt),
      lastRequestMs: this.lastRequestMs,
      lastGpsErrorCode: this.lastGpsError,
      freshFixes: this.freshFixes,
      repeatedOrOlderFixes: this.repeatedFixes,
      gpsCaptureAgeMs: age(this.captureAt),
      gpsUploadsAcknowledged: this.gpsUploads,
      gpsUploadErrors: this.uploadErrors,
      uploadPendingMs: age(this.uploadAt),
      lastUploadMs: this.lastUploadMs,
      reportsAcknowledged: this.reports,
      lastReportAgeMs: age(this.reportAt),
    };
  }
}
export type GpsDiagnosticSnapshot = ReturnType<GpsDiagnostics["snapshot"]>;
