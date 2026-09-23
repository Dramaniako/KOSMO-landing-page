/**
 * Process-Level Safety Net
 * Catches unhandled promise rejections and uncaught exceptions to prevent silent crashes or zombie states.
 */

let isRegistered = false;

export function setupProcessSafety(force = false): boolean {
  if (isRegistered && !force) {
    return true;
  }
  if (process.env.NODE_ENV === 'test' && !force) {
    return false;
  }
  isRegistered = true;

  process.on('uncaughtException', (err: Error) => {
    console.error('💥 [CRITICAL FATAL] Uncaught Exception:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });

    // Operational resilience: in non-serverless production, exit with error so orchestrator (PM2/Docker) can restart cleanly
    if (!process.env.VERCEL && process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('⚠️ [CRITICAL WARNING] Unhandled Promise Rejection:', {
      reason: reason instanceof Error ? { name: reason.name, message: reason.message, stack: reason.stack } : reason,
      timestamp: new Date().toISOString()
    });
  });

  return true;
}

export function isProcessSafetyActive(): boolean {
  return isRegistered || process.listenerCount('uncaughtException') > 0;
}
