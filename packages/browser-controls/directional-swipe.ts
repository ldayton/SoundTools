export type SwipeDirection = "left" | "right" | "up" | "down";
type Options = {
  onSwipe(direction:SwipeDirection):void;
  axes?:"horizontal"|"both";
  threshold?:number;
  dominance?:number;
  active?():boolean;
  ignore?:string;
};
export function swipeDirection(dx:number,dy:number,{axes="horizontal",threshold=40,dominance=1.4}:Pick<Options,"axes"|"threshold"|"dominance">={}):SwipeDirection|undefined {
  if(Math.max(Math.abs(dx),Math.abs(dy))<threshold)return;
  if(Math.abs(dx)>Math.abs(dy)*dominance)return dx<0?"left":"right";
  if(axes==="both" && Math.abs(dy)>=Math.abs(dx)*dominance)return dy<0?"up":"down";
}
/** Shared touch recognition. Native vertical scrolling and pinch zoom remain
 * owned by the browser; callers declare their content's touch-action policy. */
export function attachDirectionalSwipe(element:HTMLElement,options:Options) {
  let start:{x:number;y:number}|undefined;
  const cancel=()=>{start=undefined;};
  const ignore=options.ignore ?? 'button,a,input,select,textarea,summary,[role="button"],[role="slider"],[contenteditable="true"],[data-no-swipe]';
  const begin=(event:Event)=>{
    const e=event as TouchEvent;
    const target=e.target instanceof Element?e.target:null;
    start=options.active?.()!==false && e.touches.length===1 && !target?.closest(ignore)
      ?{x:e.touches[0].clientX,y:e.touches[0].clientY}:undefined;
  };
  const move=(event:Event)=>{
    const e=event as TouchEvent;
    if(e.touches.length!==1){cancel();return;}
    if(start && options.axes!=="both"){
      const dx=Math.abs(e.touches[0].clientX-start.x),dy=Math.abs(e.touches[0].clientY-start.y);
      if(dy>12 && dy>dx*(options.dominance??1.4))cancel();
    }
  };
  const end=(event:Event)=>{
    const e=event as TouchEvent,first=start;cancel();
    if(!first||options.active?.()===false||e.touches.length||!e.changedTouches.length)return;
    const direction=swipeDirection(e.changedTouches[0].clientX-first.x,e.changedTouches[0].clientY-first.y,options);
    if(direction)options.onSwipe(direction);
  };
  const listeners=[['touchstart',begin],['touchmove',move],['touchend',end],['touchcancel',cancel]] as const;
  for(const [type,listener]of listeners)element.addEventListener(type,listener,{passive:true});
  return ()=>{cancel();for(const[type,listener]of listeners)element.removeEventListener(type,listener);};
}
