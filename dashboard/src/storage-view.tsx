import { useQuery } from "@tanstack/react-query";
import { getStorage } from "./api";
import { shortDate } from "./format";
import { QueryError } from "./query-error";

const BYTE_UNITS = ["B", "kB", "MB", "GB"] as const;

// Decimal units (1000 steps), matching the free tier's decimal 10 GB.
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  // toPrecision then Number: three significant digits, no trailing zeros.
  return `${Number(value.toPrecision(3))} ${BYTE_UNITS[unitIndex] ?? "GB"}`;
}

function formatPercent(percent: number): string {
  if (percent === 0) return "0%";
  if (percent < 0.01) return "<0.01%";
  return `${percent.toFixed(2)}%`;
}

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
});

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-");
  if (!year || !monthNumber) return month;
  return monthFormat.format(new Date(Number(year), Number(monthNumber) - 1, 1));
}

// Storage usage against the free tier: a headline number, a meter, per-month
// growth and the largest stored pages. Code strictly against the shared
// StorageReport schema; the Worker route this reads from ships separately.
export function StorageView() {
  const query = useQuery({
    queryKey: ["storage"],
    queryFn: getStorage,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (query.isPending)
    return (
      <div className="storage-view">
        <p role="status">Loading…</p>
      </div>
    );

  if (query.isError)
    return (
      <div className="storage-view">
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );

  const report = query.data;
  const isEmpty = report.usedBytes === 0;
  const percent =
    report.freeTierBytes > 0 ? (report.usedBytes / report.freeTierBytes) * 100 : 0;
  const largestBytes = report.largest[0]?.bytes ?? 0;

  let cumulative = 0;
  const monthsOldestFirst = report.months.map((entry) => {
    cumulative += entry.bytes;
    return { ...entry, total: cumulative };
  });
  const finalTotal = monthsOldestFirst.at(-1)?.total ?? 0;
  const monthsNewestFirst = [...monthsOldestFirst].reverse();
  // Months cover pages only, so this average ignores non-page objects.
  const averageBytes = report.pageCount > 0 ? finalTotal / report.pageCount : 0;

  return (
    <div className="storage-view">
      <div className="storage-headline">
        <span className="storage-used">{formatBytes(report.usedBytes)}</span>
        <span className="storage-of">
          of {formatBytes(report.freeTierBytes)} free tier, {formatPercent(percent)}
        </span>
        <button disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </button>
      </div>
      {/* Any stored byte shows at least a sliver, so the value has a floor. */}
      <meter
        min={0}
        max={report.freeTierBytes}
        high={report.freeTierBytes * 0.8}
        value={isEmpty ? 0 : Math.max(report.usedBytes, report.freeTierBytes * 0.002)}
        aria-label={`Storage used: ${formatPercent(percent)} of the free tier`}
      />
      <dl className="storage-facts">
        <div>
          <dt>Pages</dt>
          <dd>{report.pageCount}</dd>
        </div>
        <div>
          <dt>Objects</dt>
          <dd>{report.objectCount}</dd>
        </div>
        <div>
          <dt>Average page size</dt>
          <dd>{formatBytes(averageBytes)}</dd>
        </div>
        <div>
          <dt>Largest page</dt>
          <dd>{formatBytes(largestBytes)}</dd>
        </div>
      </dl>
      {!report.complete && (
        <p className="storage-partial">
          Partial scan. The bucket holds more objects than one report reads.
        </p>
      )}
      {isEmpty ? (
        <p className="empty">Nothing stored yet.</p>
      ) : (
        <>
          <h2>By month</h2>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Added</th>
                <th>Pages</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {monthsNewestFirst.map((entry) => (
                <tr key={entry.month}>
                  <td>{formatMonth(entry.month)}</td>
                  <td>{formatBytes(entry.bytes)}</td>
                  <td>{entry.pages}</td>
                  <td>{formatBytes(entry.total)}</td>
                  <td className="storage-bar-cell">
                    <div
                      className="storage-bar"
                      style={{
                        width:
                          finalTotal > 0 ? `${(entry.total / finalTotal) * 100}%` : "0%",
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Largest pages</h2>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Size</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {report.largest.map((page) => (
                <tr key={page.id}>
                  <td>
                    <a href={page.url} target="_blank" rel="noopener noreferrer">
                      {page.title}
                    </a>
                  </td>
                  <td>{formatBytes(page.bytes)}</td>
                  <td>{shortDate.format(new Date(page.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
