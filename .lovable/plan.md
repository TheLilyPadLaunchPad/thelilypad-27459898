

# Fix: Upload Stuck for 16 Hours — Resilient Batch Upload Pipeline

## Problem

The current `uploadBatchToArweave` function has no timeout, no cancel mechanism, and no progress persistence. A single stuck Irys upload blocks the entire pipeline indefinitely. For large collections, this means creators can wait hours with no way to recover.

## Root Causes

1. **No per-upload timeout** — Individual `irys.upload()` calls can hang forever with no abort signal
2. **No cancel/abort button** — Once upload starts, the user has no way to stop it
3. **No progress persistence** — If the page refreshes or the tab closes, all completed uploads are lost and must restart from zero
4. **Silent failures** — Failed items return `null` but the loop continues without surfacing actionable feedback
5. **Funding can hang** — The `irys.fund()` call also has no timeout

## Plan

### 1. Add per-upload timeout with AbortController

Wrap each `irys.upload()` call in a timeout (default 60s per file, 30s for metadata). If it exceeds the limit, abort and retry. After max retries, mark the item as failed and continue.

**File:** `src/integrations/irys/client.ts`
- Add a `withTimeout` wrapper around `withRetry` that races the upload against a `setTimeout` rejection
- Apply to all four upload steps per item (image, thumb, preview, metadata)

### 2. Add cancel support to batch uploads

Make `uploadBatchToArweave` accept an `AbortSignal` parameter. Check the signal before each window iteration. If aborted, stop processing new items and return partial results.

**File:** `src/integrations/irys/client.ts`
- Add `signal?: AbortSignal` to the function signature
- Check `signal.aborted` at the start of each concurrency window
- Return whatever results have been collected so far

### 3. Persist upload progress to localStorage

Save completed upload results incrementally so that if the page refreshes, the upload can resume from where it left off.

**File:** `src/integrations/irys/client.ts` (new helpers)
- `saveUploadProgress(collectionId, results[])` — writes to `localStorage` keyed by collection ID
- `loadUploadProgress(collectionId)` — reads back saved results
- `clearUploadProgress(collectionId)` — cleans up after successful completion
- Modify `uploadBatchToArweave` to accept a `resumeKey` and skip items that already have results

### 4. Add Cancel button and resume UI in LaunchpadCreate

**File:** `src/pages/LaunchpadCreate.tsx`
- Create an `AbortController` in state, pass its signal to `uploadBatchToArweave`
- Show a "Cancel Upload" button while uploading
- On cancel, save partial progress and show "Resume" option
- On resume, reload progress from localStorage and call `uploadBatchToArweave` with only remaining items
- Show a progress bar with item count and estimated time remaining

### 5. Add funding timeout guard

**File:** `src/integrations/irys/client.ts`
- Wrap the `irys.fund()` call in a 120s timeout
- If funding times out, throw a clear error: "Arweave funding timed out. Please check your wallet and try again."

---

## Technical Details

**Timeout wrapper:**
```text
withTimeout(fn, timeoutMs) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timed out')), timeoutMs))
  ])
}
```

**localStorage key format:** `lilypad_upload_progress_{collectionId}`

**Resume detection:** On mount, check if there's saved progress for the current collection. If found, show: "Previous upload was interrupted. X of Y items completed. Resume?"

**AbortSignal integration:** Standard DOM AbortSignal, created via `new AbortController()` in the React component. Passed down to the batch function; checked between windows.

---

## Files Changed

| File | Change |
|------|--------|
| `src/integrations/irys/client.ts` | Add `withTimeout`, `AbortSignal` support, progress persistence helpers, funding timeout |
| `src/pages/LaunchpadCreate.tsx` | Cancel button, resume UI, progress bar with ETA, AbortController state |

