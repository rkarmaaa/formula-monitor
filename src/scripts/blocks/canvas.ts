// Canvas nitido su schermi ad alta densità, ridimensionato col suo contenitore.
// I colori arrivano da custom property CSS (token SCSS), lette solo quando cambiano.
export interface Surface {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  colors: Record<string, string>;
  font: string;
  destroy(): void;
}

export function createSurface(canvas: HTMLCanvasElement, names: string[], onResize: () => void): Surface {
  const ctx = canvas.getContext('2d')!;
  const surface: Surface = {
    ctx,
    width: 0,
    height: 0,
    colors: {},
    font: '',
    destroy: () => observer.disconnect(),
  };
  const refresh = () => {
    const style = getComputedStyle(canvas);
    for (const name of names) surface.colors[name] = style.getPropertyValue(`--${name}`).trim();
    surface.font = style.fontFamily;
  };
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    surface.width = entry.contentRect.width;
    surface.height = entry.contentRect.height;
    canvas.width = Math.round(surface.width * dpr);
    canvas.height = Math.round(surface.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refresh();
    onResize();
  });
  observer.observe(canvas);
  refresh();
  return surface;
}
