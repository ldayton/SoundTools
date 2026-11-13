import { useCallback } from "react";

/** Mount an imperative renderer's existing element, without replacing it on React updates. */
export function RetainedContent({
  element,
  className,
}: {
  element: HTMLElement;
  className?: string;
}) {
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) node.append(element);
    },
    [element],
  );
  return <div ref={attach} className={className} />;
}
