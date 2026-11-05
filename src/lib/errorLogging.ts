/**
 * Error Logging Service
 * Captures and logs errors to the database for admin review
 */

import { supabase } from "@/integrations/supabase/client";

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ErrorCategory =
  | 'permission'
  | 'network'
  | 'media_device'
  | 'webrtc'
  | 'validation'
  | 'rate_limit'
  | 'render'
  | 'unknown';

export interface ErrorLogEntry {
  error_message: string;
  error_stack?: string;
  component_name?: string;
  component_stack?: string;
  url?: string;
  user_agent?: string;
  user_id?: string;
  wallet_address?: string;
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  metadata?: Record<string, unknown>;
}

/**
 * Categorizes error based on message and type
 */
function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();

  if (message.includes('permission') || message.includes('not allowed')) {
    return 'permission';
  }

  if (message.includes('network') || message.includes('connection') || message.includes('timeout') || message.includes('fetch')) {
    return 'network';
  }

  if (message.includes('camera') || message.includes('microphone') || message.includes('media')) {
    return 'media_device';
  }

  if (message.includes('webrtc') || message.includes('peer') || message.includes('room')) {
    return 'webrtc';
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return 'validation';
  }

  if (message.includes('rate limit') || message.includes('too many')) {
    return 'rate_limit';
  }

  if (message.includes('render') || message.includes('react') || message.includes('component')) {
    return 'render';
  }

  return 'unknown';
}

/**
 * Determines severity based on error type
 */
function determineSeverity(category: ErrorCategory): ErrorSeverity {
  if (category === 'permission' || category === 'rate_limit') {
    return 'critical';
  }

  if (category === 'network' || category === 'webrtc' || category === 'render') {
    return 'error';
  }

  if (category === 'validation') {
    return 'warning';
  }

  return 'error';
}

/**
 * Log an error to the database
 */
let loggingInFlight = false;
const recentLogTimes: number[] = [];
const recentMessages = new Set<string>();

export async function logErrorToDatabase(
  error: Error | string,
  options?: {
    componentName?: string;
    componentStack?: string;
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    metadata?: Record<string, unknown>;
    walletAddress?: string;
  }
): Promise<void> {
  if (loggingInFlight) return;
  try {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const msg = errorObj.message || '';
    // Never log failures of the logger itself (prevents feedback loops)
    if (msg.includes('error_logs') || msg.includes('[Error Logging]')) return;
    // Rate limit: max 10 logs per minute, and skip identical repeats
    const now = Date.now();
    while (recentLogTimes.length && now - recentLogTimes[0] > 60_000) recentLogTimes.shift();
    if (recentLogTimes.length >= 10 || recentMessages.has(msg)) return;
    recentLogTimes.push(now);
    recentMessages.add(msg);
    setTimeout(() => recentMessages.delete(msg), 60_000);

    const category = options?.category || categorizeError(errorObj);
    const severity = options?.severity || determineSeverity(category);

    // Only signed-in users may write logs; skip guests to avoid rejected requests
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    loggingInFlight = true;

    const logEntry: ErrorLogEntry = {
      error_message: errorObj.message,
      error_stack: errorObj.stack,
      component_name: options?.componentName,
      component_stack: options?.componentStack,
      url: window.location.href,
      user_agent: navigator.userAgent,
      user_id: user?.id,
      wallet_address: options?.walletAddress,
      severity,
      category,
      metadata: {
        ...options?.metadata,
        timestamp: new Date().toISOString(),
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('error_logs')
      .insert({
        error_message: logEntry.error_message,
        error_stack: logEntry.error_stack,
        component_name: logEntry.component_name,
        component_stack: logEntry.component_stack,
        url: logEntry.url,
        user_agent: logEntry.user_agent,
        user_id: logEntry.user_id,
        wallet_address: logEntry.wallet_address,
        severity: logEntry.severity,
        category: logEntry.category,
        metadata: logEntry.metadata,
      });

    loggingInFlight = false;
    if (insertError) {
      console.warn('[Error Logging] Failed to log error:', insertError);
    } else if (import.meta.env.DEV) {
      console.log('[Error Logging] Error logged to database:', {
        message: errorObj.message,
        severity,
        category,
      });
    }
  } catch (loggingError) {
    loggingInFlight = false;
    // Don't throw - we don't want error logging to cause more errors
    console.warn('[Error Logging] Failed to log error:', loggingError);
  }
}

/**
 * Format error for copying to clipboard (AI-friendly format)
 */
export function formatErrorForAI(error: {
  error_message: string;
  error_stack?: string | null;
  component_name?: string | null;
  component_stack?: string | null;
  url?: string | null;
  severity?: string | null;
  category?: string | null;
  metadata?: unknown;
  created_at?: string;
}): string {
  const lines = [
    '## Error Report',
    '',
    `**Error Message:** ${error.error_message}`,
    '',
    `**Severity:** ${error.severity || 'unknown'}`,
    `**Category:** ${error.category || 'unknown'}`,
    `**URL:** ${error.url || 'N/A'}`,
    `**Component:** ${error.component_name || 'N/A'}`,
    `**Time:** ${error.created_at ? new Date(error.created_at).toLocaleString() : 'N/A'}`,
  ];

  if (error.error_stack) {
    lines.push('', '### Stack Trace', '```', error.error_stack, '```');
  }

  if (error.component_stack) {
    lines.push('', '### Component Stack', '```', error.component_stack, '```');
  }

  if (error.metadata && typeof error.metadata === 'object' && Object.keys(error.metadata as Record<string, unknown>).length > 0) {
    lines.push('', '### Additional Context', '```json', JSON.stringify(error.metadata, null, 2), '```');
  }

  lines.push('', '---', 'Please help me fix this error.');

  return lines.join('\n');
}

/**
 * Global error handler for uncaught errors
 */
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    logErrorToDatabase(event.error || new Error(event.message), {
      metadata: {
        type: 'uncaught_error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    
    logErrorToDatabase(error, {
      category: 'unknown',
      severity: 'error',
      metadata: {
        type: 'unhandled_promise_rejection',
      },
    });
  });
}
