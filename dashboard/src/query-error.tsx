import { SESSION_EXPIRED } from "./api";

// Renders a failed query's message with the right recovery action: a reload
// when the session is gone, otherwise a retry of the same query.
export function QueryError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <p role="alert">
      {error.message}{" "}
      {error.cause === SESSION_EXPIRED ? (
        <button onClick={() => window.location.reload()}>Sign in again</button>
      ) : (
        <button onClick={onRetry}>Retry</button>
      )}
    </p>
  );
}
