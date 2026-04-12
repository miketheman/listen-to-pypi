// SVG-based visual engine for event display

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

class VisualEngine {
  constructor(svgElement) {
    this.svg = svgElement;
    this.maxCircles = 60;
    this.circleCount = 0;
    this._initDefs();
    this.resize();
  }

  _initDefs() {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

    // Glow filter — soft bloom around circles
    const glow = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    glow.setAttribute("id", "glow");
    glow.setAttribute("x", "-50%");
    glow.setAttribute("y", "-50%");
    glow.setAttribute("width", "200%");
    glow.setAttribute("height", "200%");

    const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    blur.setAttribute("in", "SourceGraphic");
    blur.setAttribute("stdDeviation", "6");
    blur.setAttribute("result", "blur");
    glow.appendChild(blur);

    const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
    const mergeBlur = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    mergeBlur.setAttribute("in", "blur");
    const mergeOrig = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    mergeOrig.setAttribute("in", "SourceGraphic");
    merge.appendChild(mergeBlur);
    merge.appendChild(mergeOrig);
    glow.appendChild(merge);

    defs.appendChild(glow);

    // Stronger glow for new packages / major releases
    const glowStrong = glow.cloneNode(true);
    glowStrong.setAttribute("id", "glow-strong");
    glowStrong.querySelector("feGaussianBlur").setAttribute("stdDeviation", "10");
    defs.appendChild(glowStrong);

    // Background gradient — deep space with subtle warmth
    const bgGrad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
    bgGrad.setAttribute("id", "bg-gradient");
    bgGrad.setAttribute("cx", "50%");
    bgGrad.setAttribute("cy", "40%");
    bgGrad.setAttribute("r", "70%");

    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "#0f1a2e"); // PyPI primary blue, darkened
    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", "#0b1120");
    bgGrad.appendChild(stop1);
    bgGrad.appendChild(stop2);
    defs.appendChild(bgGrad);

    this.svg.appendChild(defs);

    // Background rect
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "url(#bg-gradient)");
    this.svg.appendChild(bg);
  }

  resize() {
    const main = this.svg.parentElement;
    this.width = main.clientWidth;
    this.height = main.clientHeight;
    this.svg.setAttribute("width", this.width);
    this.svg.setAttribute("height", this.height);
    this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
  }

  // Event colors — derived from PyPI brand palette.
  // Keep in sync with --color-* and --log-* vars in style.css.
  getColor(event) {
    if (event.type === "new_package") return "#ffd343"; // PyPI highlight yellow
    switch (event.versionType) {
      case "major":
        return "#4B8BBE"; // PyPI logo blue
      case "minor":
        return "#3775A9"; // PyPI logo teal-blue
      default:
        return "#7a8da0";
    }
  }

  getRadius(event) {
    if (event.type === "new_package") return 30 + Math.random() * 15;
    switch (event.versionType) {
      case "major":
        return 24 + Math.random() * 12;
      case "minor":
        return 14 + Math.random() * 8;
      default:
        return 8 + Math.random() * 6;
    }
  }

  addEvent(event) {
    if (this.circleCount >= this.maxCircles) return;

    const color = this.getColor(event);
    const radius = this.getRadius(event);
    const padding = radius + 50;
    const x = padding + Math.random() * Math.max(0, this.width - padding * 2);
    const y = padding + Math.random() * Math.max(0, this.height - padding * 2);
    const isSignificant = event.type === "new_package" || event.versionType === "major";

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("transform", `translate(${x}, ${y})`);
    group.setAttribute("filter", isSignificant ? "url(#glow-strong)" : "url(#glow)");

    // Outer glow circle — soft halo
    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("r", radius * 1.6);
    halo.setAttribute("fill", color);
    halo.setAttribute("opacity", "0.08");
    halo.classList.add("event-circle");
    group.appendChild(halo);

    // Ripple ring — animated with SMIL unless user prefers reduced motion
    if (!prefersReducedMotion.matches) {
      const ripple = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ripple.setAttribute("r", radius);
      ripple.setAttribute("fill", "none");
      ripple.setAttribute("stroke", color);
      ripple.setAttribute("stroke-width", "2");
      ripple.setAttribute("opacity", "0.6");

      const animR = document.createElementNS("http://www.w3.org/2000/svg", "animate");
      animR.setAttribute("attributeName", "r");
      animR.setAttribute("from", radius);
      animR.setAttribute("to", radius + 50);
      animR.setAttribute("dur", "3s");
      animR.setAttribute("fill", "freeze");
      ripple.appendChild(animR);

      const animO = document.createElementNS("http://www.w3.org/2000/svg", "animate");
      animO.setAttribute("attributeName", "opacity");
      animO.setAttribute("from", "0.6");
      animO.setAttribute("to", "0");
      animO.setAttribute("dur", "3s");
      animO.setAttribute("fill", "freeze");
      ripple.appendChild(animO);

      group.appendChild(ripple);
    }

    // Main circle — brighter, more present
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", radius);
    circle.setAttribute("fill", color);
    circle.setAttribute("opacity", isSignificant ? "0.85" : "0.65");
    circle.classList.add("event-circle");
    group.appendChild(circle);

    // Inner bright spot — gives a sense of light source
    const inner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    inner.setAttribute("r", radius * 0.4);
    inner.setAttribute("fill", "white");
    inner.setAttribute("opacity", isSignificant ? "0.2" : "0.1");
    inner.classList.add("event-circle");
    group.appendChild(inner);

    // Label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dy", `${radius + 18}`);
    label.setAttribute("fill", "#e0e6ed");
    label.setAttribute("font-size", isSignificant ? "12" : "11");
    label.setAttribute("font-family", "system-ui, sans-serif");
    label.classList.add("event-label");

    const displayName = event.name.length > 30 ? `${event.name.substring(0, 28)}...` : event.name;
    const versionTag = event.version === "new" ? "(new!)" : event.version;
    label.textContent = `${displayName} ${versionTag}`;
    group.appendChild(label);

    // Clickable link wrapper
    const link = document.createElementNS("http://www.w3.org/2000/svg", "a");
    link.setAttribute("href", event.link);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
    // Keep ephemeral SVG circles out of the tab order — the same
    // content is accessible via the event log links below.
    link.setAttribute("tabindex", "-1");
    link.appendChild(group);

    this.svg.appendChild(link);
    this.circleCount++;

    // Match CSS --circle-life duration (12s) so DOM removal follows animation end
    const lifetime = 12000;
    setTimeout(() => {
      link.remove();
      this.circleCount--;
    }, lifetime);
  }
}

export default VisualEngine;
