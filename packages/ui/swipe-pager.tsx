import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import "./swipe-pager.css";

/** Native two-axis paging: the browser owns dragging, momentum and cancellation.
 * Each page scrolls vertically; the surrounding track snaps horizontally. */
export function SwipePager({
  pages,
  value,
  onChange,
  enabled = true,
  blocked = false,
}: {
  pages: readonly { id: string; content: ReactNode }[];
  value: string;
  onChange(id: string): void;
  enabled?: boolean;
  blocked?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null),
    current = useRef(value),
    change = useRef(onChange),
    userScroll = useRef(false);
  current.current = value;
  change.current = onChange;
  useLayoutEffect(() => {
    userScroll.current = false;
    if (!enabled) return;
    const el = track.current,
      index = pages.findIndex((page) => page.id === value);
    if (!el || index < 0) return;
    const target = index * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 1)
      el.scrollTo({ left: target, behavior: "instant" });
    // Reset off-screen pages as well, so revisiting never reveals an old
    // vertical position during the drag and then jumps to the top on release.
    for (const page of el.children)
      page.scrollTo({ top: 0, behavior: "instant" });
  }, [value, enabled, pages.length]);
  useLayoutEffect(() => {
    userScroll.current = false;
    const el = track.current;
    const index = pages.findIndex((page) => page.id === current.current);
    if (el && index >= 0) el.scrollTo({ left: index * el.clientWidth, behavior: "instant" });
  }, [blocked]);
  useEffect(() => {
    const el = track.current;
    if (!enabled || !el) return;
    let width = el.clientWidth,
      height = el.clientHeight;
    const align = () => {
      userScroll.current = false;
      const index = pages.findIndex((page) => page.id === current.current);
      const target = Math.max(0, index) * el.clientWidth;
      if (Math.abs(el.scrollLeft - target) > 1)
        el.scrollTo({ left: target, behavior: "instant" });
    };
    const resized = () => {
      if (width === el.clientWidth && height === el.clientHeight) return false;
      width = el.clientWidth;
      height = el.clientHeight;
      align();
      return true;
    };
    const observer = new ResizeObserver(resized);
    observer.observe(el);
    let timer: ReturnType<typeof setTimeout> | undefined,
      touching = false;
    const settle = (event?: Event) => {
      if (event && event.target !== el) return;
      clearTimeout(timer);
      if (resized() || blocked || touching || !el.clientWidth) return;
      // Native snap/resize events also follow prop alignment. Only user input
      // may select a page; incidental scrolling must return to the current one.
      if (!userScroll.current) {
        align();
        return;
      }
      const index = Math.round(el.scrollLeft / el.clientWidth),
        page = pages[index];
      if (page && Math.abs(el.scrollLeft - index * el.clientWidth) < 1) {
        userScroll.current = false;
        if (page.id !== current.current) change.current(page.id);
      }
    };
    const scroll = (event?: Event) => {
      if (event && event.target !== el) return;
      clearTimeout(timer);
      timer = setTimeout(settle, 120);
    };
    const touch = (event: TouchEvent) => {
      touching = event.touches.length > 0;
      if (event.type === "touchstart" && !blocked) userScroll.current = true;
      if (!touching) scroll();
    };
    const wheel = (event: WheelEvent) => {
      if (!blocked && (event.deltaX !== 0 || event.shiftKey))
        userScroll.current = true;
    };
    const key = (event: KeyboardEvent) => {
      if (
        !blocked &&
        !event.defaultPrevented &&
        ["ArrowLeft", "ArrowRight"].includes(event.key)
      )
        userScroll.current = true;
    };
    el.addEventListener("scroll", scroll, { passive: true });
    el.addEventListener("scrollend", settle);
    el.addEventListener("wheel", wheel, { passive: true });
    el.addEventListener("keydown", key);
    for (const type of ["touchstart", "touchend", "touchcancel"])
      el.addEventListener(type, touch as EventListener, { passive: true });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      el.removeEventListener("scroll", scroll);
      el.removeEventListener("scrollend", settle);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("keydown", key);
      for (const type of ["touchstart", "touchend", "touchcancel"])
        el.removeEventListener(type, touch as EventListener);
    };
  }, [enabled, blocked, pages.map((page) => page.id).join("\n")]);
  if (!enabled) return <>{pages.find((page) => page.id === value)?.content}</>;
  return (
    <div
      ref={track}
      className="swipe-pager"
      data-blocked={blocked || undefined}
    >
      {pages.map((page) => (
        <div
          className="swipe-pager-page"
          key={page.id}
          data-page={page.id}
          inert={page.id !== value}
          aria-hidden={page.id !== value || undefined}
        >
          {page.content}
        </div>
      ))}
    </div>
  );
}
