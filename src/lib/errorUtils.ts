/**
 * Type-safe error handling utilities
 * Modern replacement for catch (error: any)
 */

interface EthereumError extends Error {
  code?: number;
  data?: unknown;
}

/**
 * Extracts error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    let msg = error.message;

    // Retrieve Solana SendTransactionError logs
    const anyErr = error as any;
    let logs: string[] = [];
    if (anyErr.logs && Array.isArray(anyErr.logs)) {
      logs = anyErr.logs;
    } else if (typeof anyErr.getLogs === 'function') {
      try {
        logs = anyErr.getLogs();
      } catch {
        // Ignore getLogs errors
      }
    }

    if (logs && logs.length > 0) {
      msg += `\n\nOn-chain Logs:\n${logs.slice(-10).join('\n')}`;
    }

    // Smart troubleshooting tip for missing Metaplex Core / Candy Machine programs
    if (msg.includes("Attempt to load a program that does not exist") || msg.includes("program that does not exist")) {
      msg += "\n\n💡 Tip: Metaplex Core Candy Machine programs are only deployed on Solana DEVNET and MAINNET. They are NOT deployed on Solana Testnet. If you are using Solana Testnet, please open your Wallet Connection settings (gear icon) and switch the Solana network to Devnet or Mainnet.";
    }

    return msg;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unknown error occurred';
}

/**
 * Checks if error is a user rejection (code 4001)
 */
export function isUserRejection(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as EthereumError).code === 4001;
  }
  return false;
}

/**
 * Checks if error message contains a specific string
 */
export function errorContains(error: unknown, searchString: string): boolean {
  const message = getErrorMessage(error);
  return message.toLowerCase().includes(searchString.toLowerCase());
}

/**
 * Gets error code if available
 */
export function getErrorCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as EthereumError).code;
  }
  return undefined;
}

/**
 * Checks if error is an AbortError (timeout)
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError';
  }
  return false;
}

/**
 * Gets HTTP status from error if available
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    if ('status' in error) {
      return (error as { status: number }).status;
    }
    if ('code' in error && typeof (error as { code: unknown }).code === 'number') {
      return (error as { code: number }).code;
    }
  }
  return undefined;
}

/**
 * Formats transaction error for user display
 */
export function formatTransactionError(error: unknown, defaultMessage: string): string {
  if (isUserRejection(error)) {
    return 'Transaction rejected by user';
  }
  if (errorContains(error, 'insufficient funds')) {
    return 'Insufficient funds for gas';
  }
  if (errorContains(error, 'not owner')) {
    return "You don't own this NFT";
  }
  const message = getErrorMessage(error);
  return message || defaultMessage;
}

/**
 * Formats RPC error for display
 */
export function formatRpcError(error: unknown): string {
  if (isAbortError(error)) {
    return 'Timeout';
  }
  return getErrorMessage(error);
}
