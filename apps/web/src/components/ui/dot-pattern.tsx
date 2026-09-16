import { useId } from "react";

import { cn } from "@/lib/utils";

interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  /** Horizontal spacing between dots */
  width?: number;
  /** Vertical spacing between dots */
  height?: number;
  /** Dot center offset within each tile */
  cx?: number;
  cy?: number;
  /** Dot radius */
  cr?: number;
}

/**
 * A static dot pattern as a pure SVG tile: one <pattern> repeated by the
 * renderer, no JS, no measurements, nothing animating. Dots take their color
 * from the element's text color utility classes.
 */
export function DotPattern({
  width = 16,
  height = 16,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
  ...props
}: DotPatternProps) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full text-neutral-400/80",
        className,
      )}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={cx} cy={cy} r={cr} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
