// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from "react";

// ── Color extraction ──
function extractColors(imageElement, numColors = 8) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const size = 200;
  canvas.width = size; canvas.height = size;
  ctx.drawImage(imageElement, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 100) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (r > 245 && g > 245 && b > 245) continue;
    if (r < 10 && g < 10 && b < 10) continue;
    if (max > 220 && sat < 0.05) continue;
    pixels.push([r, g, b]);
  }
  if (pixels.length === 0) return [{ hex: "#333333", rgb: [51,51,51] }];
  const step = Math.max(1, Math.floor(pixels.length / numColors));
  const init = [];
  for (let i = 0; i < numColors && i * step < pixels.length; i++) init.push([...pixels[i * step]]);
  return kMeans(pixels, init);
}
function kMeans(pixels, initC) {
  let centroids = initC; const k = centroids.length;
  for (let iter = 0; iter < 25; iter++) {
    const cl = Array.from({ length: k }, () => []);
    pixels.forEach(p => { let mD = Infinity, mI = 0; centroids.forEach((c, i) => { const d = (p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if (d < mD) { mD = d; mI = i; } }); cl[mI].push(p); });
    centroids = cl.map((c, i) => c.length === 0 ? centroids[i] : c.reduce((a, p) => [a[0]+p[0],a[1]+p[1],a[2]+p[2]], [0,0,0]).map(v => Math.round(v / c.length)));
  }
  const counts = Array(k).fill(0);
  pixels.forEach(p => { let mD = Infinity, mI = 0; centroids.forEach((c, i) => { const d = (p[0]-c[0])**2+(p[1]-c[1])**2+(p[2]-c[2])**2; if (d < mD) { mD = d; mI = i; } }); counts[mI]++; });
  const results = centroids.map((c, i) => ({ rgb: c, hex: rgbToHex(c), count: counts[i] })).filter(c => c.count > pixels.length * 0.02).sort((a, b) => b.count - a.count);
  const unique = [];
  results.forEach(c => { if (!unique.some(u => Math.sqrt((u.rgb[0]-c.rgb[0])**2+(u.rgb[1]-c.rgb[1])**2+(u.rgb[2]-c.rgb[2])**2) < 40)) unique.push(c); });
  return unique.slice(0, 6);
}
function rgbToHex([r,g,b]) { return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join(""); }
function hexToHSL(hex) {
  let r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b); let h,s,l=(max+min)/2;
  if(max===min){h=s=0}else{const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
  return[Math.round(h*360),Math.round(s*100),Math.round(l*100)];
}
function hslToHex(h,s,l) {
  s/=100;l/=100;const k=n=>(n+h/30)%12;const a=s*Math.min(l,1-l);const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return rgbToHex([Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)]);
}
function generateHarmonicPalette(colors) {
  const p = colors[0]; const [h,s,l] = hexToHSL(p.hex);
  return { primary:p.hex, secondary:colors[1]?.hex||hslToHex((h+30)%360,s,l), accent:colors[2]?.hex||hslToHex((h+180)%360,Math.min(s+10,100),l), light:hslToHex(h,Math.max(s-30,5),95), dark:hslToHex(h,Math.max(s-10,10),12), neutral:hslToHex(h,5,55) };
}
function getLuminance(hex) { return hexToHSL(hex)[2]; }
function contrastColor(bg) { return getLuminance(bg) < 45 ? "#ffffff" : "#111111"; }

// ── Download helpers ──
function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a"); a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
async function loadImageForCanvas(src) {
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src;
  });
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

// ── PDF Generation with jsPDF ──
async function generateBrandGuidePDF({ brandName, industry, personality, audience, palette, fonts, logoSrc }) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const margin = 20;
  const contentW = W - margin * 2;

  // Helper functions
  const drawColorBar = (y) => {
    const barH = 3;
    const colors = [palette.primary, palette.secondary, palette.accent];
    const segW = contentW / colors.length;
    colors.forEach((c, i) => {
      const [r,g,b] = hexToRgb(c);
      doc.setFillColor(r, g, b);
      doc.roundedRect(margin + i * segW, y, segW, barH, 1, 1, "F");
    });
    return y + barH + 8;
  };

  const drawSwatch = (x, y, color, label) => {
    const size = 22;
    const [r,g,b] = hexToRgb(color);
    doc.setFillColor(r, g, b);
    doc.roundedRect(x, y, size, size, 3, 3, "F");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + size/2, y + size + 5, { align: "center" });
    doc.setFontSize(7);
    doc.text(color.toUpperCase(), x + size/2, y + size + 9, { align: "center" });
    return size + 14;
  };

  // Load logo as base64 for embedding
  let logoData = null;
  try {
    const logoImg = await loadImageForCanvas(logoSrc);
    if (logoImg) {
      const c = document.createElement("canvas");
      c.width = logoImg.width; c.height = logoImg.height;
      c.getContext("2d").drawImage(logoImg, 0, 0);
      logoData = c.toDataURL("image/png");
    }
  } catch(e) {}

  // ═══════════════════════════════════
  // PAGE 1 — Cover + Color Palette
  // ═══════════════════════════════════
  let y = margin;
  y = drawColorBar(y);

  // Logo
  if (logoData) {
    try { doc.addImage(logoData, "PNG", margin, y, 35, 25, undefined, "FAST"); } catch(e) {}
  }
  y += 30;

  // Title
  doc.setFontSize(32);
  doc.setTextColor(30, 30, 30);
  doc.text("Guía de Marca", margin, y);
  y += 10;

  doc.setFontSize(18);
  const [pr, pg, pb] = hexToRgb(palette.primary);
  doc.setTextColor(pr, pg, pb);
  doc.text(brandName, margin, y);
  y += 10;

  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  doc.text(`Este documento define las reglas visuales de la marca ${brandName}.`, margin, y);
  y += 5;
  doc.text("Seguir estas pautas garantiza coherencia en todas las piezas.", margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(170, 170, 170);
  doc.text(`${industry}  ·  Personalidad: ${personality}${audience ? "  ·  " + audience : ""}`, margin, y);
  y += 4;
  doc.text(`Generado con BrandKit  ·  ${new Date().toLocaleDateString("es-AR")}`, margin, y);
  y += 15;

  // ── Color Palette Section ──
  doc.setFontSize(16);
  doc.setTextColor(pr, pg, pb);
  doc.text("Paleta de colores", margin, y);
  y += 3;
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 50, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Estos son los colores oficiales de la marca. Usá los códigos HEX", margin, y);
  y += 5;
  doc.text("exactos para mantener consistencia en todos los materiales.", margin, y);
  y += 12;

  // Draw swatches
  const paletteEntries = [
    { color: palette.primary, label: "Primario" },
    { color: palette.secondary, label: "Secundario" },
    { color: palette.accent, label: "Acento" },
    { color: palette.light, label: "Claro" },
    { color: palette.dark, label: "Oscuro" },
    { color: palette.neutral, label: "Neutro" },
  ];
  const swatchSize = 22;
  const swatchGap = (contentW - swatchSize * 6) / 5;
  paletteEntries.forEach((entry, i) => {
    drawSwatch(margin + i * (swatchSize + swatchGap), y, entry.color, entry.label);
  });
  y += swatchSize + 18;

  // Usage rules
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text("Reglas de uso", margin, y);
  y += 7;

  // Do box
  doc.setFillColor(240, 255, 240);
  doc.roundedRect(margin, y, contentW/2 - 3, 28, 3, 3, "F");
  doc.setFontSize(10);
  doc.setTextColor(76, 175, 80);
  doc.text("✓ Correcto", margin + 5, y + 7);
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Usá el primario para CTAs,", margin + 5, y + 14);
  doc.text("botones y títulos destacados.", margin + 5, y + 19);
  doc.text("El secundario para acompañar.", margin + 5, y + 24);

  // Don't box
  const dontX = margin + contentW/2 + 3;
  doc.setFillColor(255, 240, 240);
  doc.roundedRect(dontX, y, contentW/2 - 3, 28, 3, 3, "F");
  doc.setTextColor(244, 67, 54);
  doc.setFontSize(10);
  doc.text("✗ Evitar", dontX + 5, y + 7);
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("No uses colores fuera de esta", dontX + 5, y + 14);
  doc.text("paleta. No combines primario", dontX + 5, y + 19);
  doc.text("+ acento en texto sobre fondo.", dontX + 5, y + 24);

  // ═══════════════════════════════════
  // PAGE 2 — Typography
  // ═══════════════════════════════════
  doc.addPage();
  y = margin;
  y = drawColorBar(y);

  doc.setFontSize(16);
  doc.setTextColor(pr, pg, pb);
  doc.text("Tipografías", margin, y);
  y += 3;
  doc.setDrawColor(pr, pg, pb);
  doc.line(margin, y, margin + 35, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("El sistema tipográfico usa dos familias principales.", margin, y);
  y += 10;

  // Display font
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(margin, y, contentW, 35, 3, 3, "F");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("DISPLAY / TÍTULOS", margin + 8, y + 8);
  doc.setFontSize(24);
  doc.setTextColor(30, 30, 30);
  doc.text(fonts.display, margin + 8, y + 20);
  doc.setFontSize(12);
  doc.setTextColor(120, 120, 120);
  doc.text("Aa Bb Cc Dd Ee Ff Gg 1234567890", margin + 8, y + 28);
  y += 42;

  // Body font
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(margin, y, contentW, 35, 3, 3, "F");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("BODY / TEXTO", margin + 8, y + 8);
  doc.setFontSize(20);
  doc.setTextColor(30, 30, 30);
  doc.text(fonts.body, margin + 8, y + 20);
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text("La tipografía correcta transmite profesionalismo y", margin + 8, y + 28);
  doc.text("coherencia en cada punto de contacto con tu audiencia.", margin + 8, y + 33);
  y += 42;

  // Hierarchy
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text("Jerarquía tipográfica", margin, y);
  y += 8;

  doc.setFillColor(248, 248, 248);
  doc.roundedRect(margin, y, contentW, 40, 3, 3, "F");
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  doc.text("Título principal — H1", margin + 8, y + 10);
  doc.setFontSize(16);
  doc.text("Subtítulo — H2", margin + 8, y + 19);
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text("Texto de cuerpo — párrafo regular con la familia body.", margin + 8, y + 28);
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text("Caption o texto secundario — tamaño reducido.", margin + 8, y + 35);
  y += 50;

  // Font pairing summary
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Títulos: ${fonts.display}`, margin, y); y += 5;
  doc.text(`Cuerpo: ${fonts.body}`, margin, y); y += 5;
  doc.text(`Datos / Monospace: ${fonts.mono}`, margin, y);

  // ═══════════════════════════════════
  // PAGE 3 — Logo + Applications
  // ═══════════════════════════════════
  doc.addPage();
  y = margin;
  y = drawColorBar(y);

  doc.setFontSize(16);
  doc.setTextColor(pr, pg, pb);
  doc.text("Versiones del logo", margin, y);
  y += 3;
  doc.setDrawColor(pr, pg, pb);
  doc.line(margin, y, margin + 50, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("El logo debe usarse en una de estas versiones según el contexto.", margin, y);
  y += 5;
  doc.text("Nunca alteres proporciones ni colores fuera de estas opciones.", margin, y);
  y += 12;

  // Logo version boxes
  const boxW = (contentW - 15) / 4;
  const boxH = 30;
  const versions = ["Original", "Blanco", "Negro", "Sin fondo"];
  const bgColors = [[255,255,255], [30,30,30], [255,255,255], [240,240,240]];

  versions.forEach((label, i) => {
    const bx = margin + i * (boxW + 5);
    const [br, bg, bb] = bgColors[i];
    doc.setFillColor(br, bg, bb);
    doc.roundedRect(bx, y, boxW, boxH, 3, 3, "F");
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(bx, y, boxW, boxH, 3, 3, "S");

    if (logoData) {
      try {
        const logoW = 20, logoH = 14;
        doc.addImage(logoData, "PNG", bx + (boxW-logoW)/2, y + (boxH-logoH)/2, logoW, logoH, `logo_${i}`, "FAST");
      } catch(e) {}
    }

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(label, bx + boxW/2, y + boxH + 5, { align: "center" });
  });
  y += boxH + 12;

  // Usage rules for logo
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text("Uso correcto del logo", margin, y);
  y += 7;

  doc.setFillColor(240, 255, 240);
  doc.roundedRect(margin, y, contentW/2 - 3, 24, 3, 3, "F");
  doc.setFontSize(10);
  doc.setTextColor(76, 175, 80);
  doc.text("✓ Correcto", margin + 5, y + 7);
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Original sobre fondos claros.", margin + 5, y + 14);
  doc.text("Blanco sobre fondos oscuros.", margin + 5, y + 19);

  doc.setFillColor(255, 240, 240);
  doc.roundedRect(dontX, y, contentW/2 - 3, 24, 3, 3, "F");
  doc.setTextColor(244, 67, 54);
  doc.setFontSize(10);
  doc.text("✗ Evitar", dontX + 5, y + 7);
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("No estires ni rotes el logo.", dontX + 5, y + 14);
  doc.text("No agregues sombras o efectos.", dontX + 5, y + 19);
  y += 32;

  // Applications section
  doc.setFontSize(16);
  doc.setTextColor(pr, pg, pb);
  doc.text("Aplicaciones", margin, y);
  y += 3;
  doc.setDrawColor(pr, pg, pb);
  doc.line(margin, y, margin + 35, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Redes sociales", margin, y); y += 6;
  doc.setFontSize(9);
  doc.text("Usá la paleta como fondo o acento. El logo va siempre en la misma", margin, y); y += 4;
  doc.text("posición. Tipografía display para títulos, body para cuerpo.", margin, y); y += 10;

  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.text("Papelería", margin, y); y += 6;
  doc.setFontSize(9);
  doc.text("El color primario se usa como acento (líneas, bordes). Nunca como", margin, y); y += 4;
  doc.text("fondo completo en documentos impresos.", margin, y); y += 15;

  // Footer
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, contentW, 18, 3, 3, "F");
  doc.setFontSize(9);
  doc.setTextColor(170, 170, 170);
  doc.text(`Guía generada con BrandKit  ·  ${new Date().toLocaleDateString("es-AR")}`, W/2, y + 8, { align: "center" });
  doc.text("brandkit.app", W/2, y + 13, { align: "center" });

  // Save
  doc.save(`${brandName.replace(/\s+/g, "-")}-guia-de-marca.pdf`);
}

// ── Template PNG generation ──
async function generateTemplatePNG({ type, palette, brandName, logoHasName, logoSrc, displayFont }) {
  const dims = { post: [1080,1080], story: [1080,1920], cover: [1640,924] };
  const [w, h] = dims[type] || [1080,1080];
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = palette.light; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = palette.primary;
  if (type === "story") { ctx.fillRect(0, 0, w, 8); ctx.fillRect(0, h - 8, w, 8); }
  else { ctx.fillRect(0, h - 12, w, 12); }
  ctx.fillStyle = palette.secondary;
  if (type === "cover") { ctx.fillRect(0, 0, 8, h); }
  const logo = await loadImageForCanvas(logoSrc);
  if (logo) {
    const maxLW = w*0.3, maxLH = h*0.2, scale = Math.min(maxLW/logo.width, maxLH/logo.height);
    const lw = logo.width*scale, lh = logo.height*scale;
    ctx.drawImage(logo, (w-lw)/2, type==="story"?h*0.15:h*0.12, lw, lh);
  }
  if (!logoHasName) {
    const fs = type==="story"?64:type==="cover"?56:72;
    ctx.font = `bold ${fs}px '${displayFont}', Georgia, serif`;
    ctx.fillStyle = palette.dark; ctx.textAlign = "center";
    ctx.fillText(brandName, w/2, type==="story"?h*0.42:h*0.48);
  }
  ctx.fillStyle = palette.neutral+"44";
  const cY = type==="story"?h*0.52:h*0.58;
  ctx.fillRect(w*0.15, cY, w*0.7, 3); ctx.fillRect(w*0.25, cY+20, w*0.5, 3);
  ctx.fillStyle = palette.primary;
  const ctaY = type==="story"?h*0.72:h*0.75, ctaW=240, ctaH=56, ctaX=(w-ctaW)/2;
  roundRect(ctx, ctaX, ctaY, ctaW, ctaH, 12); ctx.fill();
  ctx.font = `bold 22px '${displayFont}', sans-serif`;
  ctx.fillStyle = contrastColor(palette.primary); ctx.textAlign = "center";
  ctx.fillText("Tu CTA acá", w/2, ctaY+36);
  ctx.font = "16px sans-serif"; ctx.fillStyle = palette.neutral+"66"; ctx.textAlign = "right";
  ctx.fillText("Generado con BrandKit", w-30, h-24);
  return canvas.toDataURL("image/png");
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

// ── Constants ──
const CHECKER = "repeating-conic-gradient(#e0e0e0 0% 25%, #fff 0% 50%) 50% / 16px 16px";
const GRID_BG = `url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='g' patternUnits='userSpaceOnUse' width='20' height='20'%3E%3Cpath d='M 20 0 L 0 0 0 20' fill='none' stroke='%23e0e0e0' stroke-width='0.5'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='%23ffffff'/%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3C/svg%3E")`;
const INDUSTRIES = ["Gastronomía","Salud y bienestar","Tecnología","Moda y belleza","Educación","Construcción","Comercio","Servicios profesionales","Fitness y deporte","Arte y cultura","Otro"];
const PERSONALITIES = [
  {label:"Profesional",desc:"Serio, confiable, corporativo"},{label:"Creativo",desc:"Original, artístico, disruptivo"},
  {label:"Cercano",desc:"Amigable, cálido, accesible"},{label:"Premium",desc:"Exclusivo, elegante, sofisticado"},
  {label:"Dinámico",desc:"Joven, enérgico, moderno"},{label:"Natural",desc:"Orgánico, sustentable, auténtico"},
];
const FONT_PAIRINGS = {
  Profesional:{display:"DM Serif Display",body:"Inter",mono:"JetBrains Mono"},
  Creativo:{display:"Space Grotesk",body:"DM Sans",mono:"Fira Code"},
  Cercano:{display:"Nunito",body:"Open Sans",mono:"Source Code Pro"},
  Premium:{display:"Playfair Display",body:"Lato",mono:"IBM Plex Mono"},
  Dinámico:{display:"Outfit",body:"Plus Jakarta Sans",mono:"JetBrains Mono"},
  Natural:{display:"Fraunces",body:"Atkinson Hyperlegible",mono:"Fira Code"},
};
const MOCKUP_TYPES = [
  {name:"Tarjeta de presentación",desc:"Frente y dorso con tu marca",icon:"💳"},
  {name:"Membrete A4",desc:"Hoja carta con header y footer",icon:"📄"},
  {name:"Firma de email",desc:"Bloque HTML para Gmail/Outlook",icon:"✉️"},
  {name:"Bolsa / Packaging",desc:"Bolsa de papel o caja con logo",icon:"🛍️"},
  {name:"Remera / Uniforme",desc:"Aplicación en indumentaria",icon:"👕"},
  {name:"Cartelería / Banner",desc:"Banner físico o roll-up",icon:"🪧"},
  {name:"Vehículo",desc:"Ploteo vehicular con tu identidad",icon:"🚗"},
  {name:"Fachada / Local",desc:"Tu logo en frente de local",icon:"🏪"},
];

// ── Upload ──
function UploadStep({ onUpload }) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();
  const handleFile = (f) => { if (!f||!f.type.startsWith("image/")) return; const r = new FileReader(); r.onload=(e)=>onUpload(e.target.result); r.readAsDataURL(f); };
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:32,padding:"48px 20px" }}>
      <div style={{ textAlign:"center",maxWidth:480 }}>
        <h1 style={{ fontSize:28,fontWeight:700,color:"#fafafa",margin:0,letterSpacing:"-0.02em",fontFamily:"'Space Grotesk', sans-serif" }}>Subí tu logo</h1>
        <p style={{ fontSize:15,color:"#8a8a8a",marginTop:12,lineHeight:1.6 }}>Analizamos los colores y el estilo de tu logo para construir todo el sistema visual de tu marca.</p>
      </div>
      <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0])}} onClick={()=>fileRef.current?.click()}
        style={{ width:"100%",maxWidth:400,height:220,border:`2px dashed ${dragging?"#e8a838":"#333"}`,borderRadius:16,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,cursor:"pointer",transition:"all 0.2s",background:dragging?"rgba(232,168,56,0.05)":"rgba(255,255,255,0.02)" }}>
        <div style={{ fontSize:48,opacity:0.4 }}>⬆</div>
        <div style={{ color:"#aaa",fontSize:14,textAlign:"center",padding:"0 20px" }}>Arrastrá tu logo acá o hacé click<br/><span style={{ fontSize:12,color:"#666" }}>PNG, JPG o SVG — fondo transparente recomendado</span></div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
    </div>
  );
}

// ── Questions ──
function QuestionsStep({ logoSrc, colors, onComplete }) {
  const [industry, setIndustry] = useState("");
  const [personality, setPersonality] = useState("");
  const [brandName, setBrandName] = useState("");
  const [audience, setAudience] = useState("");
  const [logoHasName, setLogoHasName] = useState(false);
  const ok = industry && personality && brandName;
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:28,padding:"32px 20px",maxWidth:600,margin:"0 auto" }}>
      <div style={{ display:"flex",alignItems:"center",gap:20 }}>
        <img src={logoSrc} alt="" style={{ width:64,height:64,objectFit:"contain",borderRadius:8,background:CHECKER,padding:8 }} />
        <div>
          <p style={{ color:"#888",fontSize:13,margin:0 }}>Colores detectados</p>
          <div style={{ display:"flex",gap:6,marginTop:6 }}>
            {colors.slice(0,8).map((c,i)=>(
              <div key={i} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
                <div style={{ width:28,height:28,borderRadius:6,background:c.hex,border:"1px solid rgba(255,255,255,0.1)" }} title={c.hex} />
                <span style={{ fontSize:7,color:"#666",fontFamily:"monospace" }}>{c.hex}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label style={{ color:"#ccc",fontSize:13,fontWeight:600,display:"block",marginBottom:8 }}>Nombre de tu marca *</label>
        <input value={brandName} onChange={e=>setBrandName(e.target.value)} placeholder="Ej: Café Morena, TechSol..."
          style={{ width:"100%",padding:"12px 16px",background:"#141414",border:"1px solid #2a2a2a",borderRadius:10,color:"#fafafa",fontSize:15,outline:"none",boxSizing:"border-box" }} />
        <label style={{ display:"flex",alignItems:"center",gap:8,marginTop:10,cursor:"pointer",fontSize:13,color:"#888" }} onClick={()=>setLogoHasName(!logoHasName)}>
          <div style={{ width:18,height:18,borderRadius:4,border:"1px solid #444",background:logoHasName?"#e8a838":"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",flexShrink:0 }}>
            {logoHasName&&<span style={{ color:"#0a0a0a",fontSize:12,fontWeight:700 }}>✓</span>}
          </div>Mi logo ya incluye el nombre
        </label>
      </div>
      <div>
        <label style={{ color:"#ccc",fontSize:13,fontWeight:600,display:"block",marginBottom:10 }}>Rubro *</label>
        <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
          {INDUSTRIES.map(ind=>(<button key={ind} onClick={()=>setIndustry(ind)} style={{ padding:"8px 16px",borderRadius:20,border:"1px solid",borderColor:industry===ind?"#e8a838":"#2a2a2a",background:industry===ind?"rgba(232,168,56,0.12)":"transparent",color:industry===ind?"#e8a838":"#999",fontSize:13,cursor:"pointer" }}>{ind}</button>))}
        </div>
      </div>
      <div>
        <label style={{ color:"#ccc",fontSize:13,fontWeight:600,display:"block",marginBottom:10 }}>Personalidad de marca *</label>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
          {PERSONALITIES.map(p=>(<button key={p.label} onClick={()=>setPersonality(p.label)} style={{ padding:"12px 16px",borderRadius:10,border:"1px solid",borderColor:personality===p.label?"#e8a838":"#2a2a2a",background:personality===p.label?"rgba(232,168,56,0.12)":"#0f0f0f",textAlign:"left",cursor:"pointer" }}>
            <div style={{ color:personality===p.label?"#e8a838":"#ddd",fontSize:14,fontWeight:600 }}>{p.label}</div>
            <div style={{ color:"#777",fontSize:12,marginTop:2 }}>{p.desc}</div>
          </button>))}
        </div>
      </div>
      <div>
        <label style={{ color:"#ccc",fontSize:13,fontWeight:600,display:"block",marginBottom:8 }}>¿A quién le vendés? (opcional)</label>
        <input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Ej: Mujeres de 25-45, empresas B2B..."
          style={{ width:"100%",padding:"12px 16px",background:"#141414",border:"1px solid #2a2a2a",borderRadius:10,color:"#fafafa",fontSize:15,outline:"none",boxSizing:"border-box" }} />
      </div>
      <button onClick={()=>onComplete({industry,personality,brandName,audience,logoHasName})} disabled={!ok}
        style={{ padding:"14px 32px",borderRadius:12,border:"none",background:ok?"#e8a838":"#2a2a2a",color:ok?"#0a0a0a":"#555",fontSize:15,fontWeight:700,cursor:ok?"pointer":"default",alignSelf:"flex-start" }}>
        Generar mi kit de marca →
      </button>
    </div>
  );
}

// ── Generating ──
function GeneratingStep() {
  const [s, setS] = useState(0);
  const msgs = ["Analizando tu logo...","Extrayendo colores...","Construyendo paleta...","Seleccionando tipografías...","Preparando tu kit..."];
  useEffect(() => { const t = setInterval(()=>setS(v=>Math.min(v+1,msgs.length-1)),1100); return()=>clearInterval(t); }, []);
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,padding:60,minHeight:300 }}>
      <div style={{ width:48,height:48,border:"3px solid #2a2a2a",borderTopColor:"#e8a838",borderRadius:"50%",animation:"spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ color:"#ccc",fontSize:16 }}>{msgs[s]}</p>
    </div>
  );
}

// ── Result ──
function ResultStep({ brandData, palette, fonts, logoSrc, colors, isPro }) {
  const { brandName, industry, personality, audience, logoHasName } = brandData;
  const f = fonts;
  const [downloading, setDownloading] = useState(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const handleDownloadTemplate = async (type) => {
    setDownloading(type);
    try {
      const url = await generateTemplatePNG({ type, palette, brandName, logoHasName, logoSrc, displayFont: f.display });
      downloadDataUrl(url, `${brandName.replace(/\s+/g,"-")}-${type}.png`);
    } catch(e) { console.error(e); }
    setDownloading(null);
  };

  const handleDownloadGuide = async () => {
    setGeneratingPDF(true);
    try {
      await generateBrandGuidePDF({ brandName, industry, personality, audience, palette, fonts: f, logoSrc });
    } catch(e) { console.error("PDF error:", e); alert("Error generando PDF. Intentá de nuevo."); }
    setGeneratingPDF(false);
  };

  const handleDownloadLogoVersion = (filterVal, suffix) => {
    const canvas = document.createElement("canvas");
    const size = 1024; canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min((size*0.7)/img.width, (size*0.7)/img.height);
      const w = img.width*scale, h = img.height*scale;
      if (filterVal === "white") { ctx.filter = "brightness(0) invert(1)"; }
      else if (filterVal === "black") { ctx.filter = "brightness(0)"; }
      ctx.drawImage(img, (size-w)/2, (size-h)/2, w, h);
      downloadDataUrl(canvas.toDataURL("image/png"), `${brandName.replace(/\s+/g,"-")}-logo-${suffix}.png`);
    };
    img.src = logoSrc;
  };

  const Btn = ({ onClick, children, loading, small }) => (
    <button onClick={onClick} disabled={loading}
      style={{ padding:small?"6px 14px":"10px 20px",borderRadius:8,border:"1px solid #333",background:loading?"#1a1a1a":"rgba(80,200,120,0.08)",
        color:loading?"#555":"#50c878",fontSize:small?11:12,fontWeight:600,cursor:loading?"wait":"pointer",transition:"all 0.15s",whiteSpace:"nowrap" }}>
      {loading ? "⏳ Generando..." : children}
    </button>
  );

  const Section = ({ title, children, locked, proPreview }) => (
    <div style={{ marginBottom:36 }}>
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
        <h3 style={{ fontSize:16,fontWeight:700,color:"#fafafa",margin:0,fontFamily:"'Space Grotesk', sans-serif" }}>{title}</h3>
        {locked&&!isPro&&<span style={{ fontSize:10,padding:"3px 10px",borderRadius:20,background:"rgba(232,168,56,0.15)",color:"#e8a838",fontWeight:600 }}>PRO</span>}
        {locked&&isPro&&<span style={{ fontSize:10,padding:"3px 10px",borderRadius:20,background:"rgba(80,200,120,0.15)",color:"#50c878",fontWeight:600 }}>✓ PRO</span>}
      </div>
      {locked&&!isPro ? (
        <div style={{ padding:24,borderRadius:12,border:"1px dashed #2a2a2a",background:"rgba(255,255,255,0.01)" }}>
          {proPreview&&<div style={{ marginBottom:16,filter:"blur(2px)",opacity:0.4,pointerEvents:"none" }}>{proPreview}</div>}
          <div style={{ textAlign:"center",color:"#666",fontSize:13 }}>🔒 Disponible en el plan Pro</div>
        </div>
      ) : children}
    </div>
  );

  const SocialMockup = ({ type, w, h, label }) => (
    <div style={{ textAlign:"center" }}>
      <div style={{ width:w,height:h,borderRadius:10,background:GRID_BG,backgroundSize:"20px 20px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16,border:"1px solid #ddd",boxSizing:"border-box" }}>
        <img src={logoSrc} alt="" style={{ maxWidth:type==="story"?"60%":"50%",maxHeight:logoHasName?"50%":"35%",objectFit:"contain" }} />
        {!logoHasName&&<div style={{ fontFamily:`'${f.display}',serif`,fontSize:type==="story"?12:14,fontWeight:700,color:palette.dark,lineHeight:1.3,marginTop:8 }}>{brandName}</div>}
      </div>
      <div style={{ fontSize:11,color:"#777",marginTop:8 }}>{label}</div>
    </div>
  );

  const LogoVersionsPro = () => (
    <div style={{ display:"flex",gap:16,flexWrap:"wrap" }}>
      {[
        { label:"Original",bg:CHECKER,filterVal:null,suffix:"original",desc:"Fondo transparente" },
        { label:"Blanco",bg:"#1a1a1a",filterVal:"white",suffix:"blanco",desc:"Para fondos oscuros" },
        { label:"Negro",bg:"#ffffff",filterVal:"black",suffix:"negro",desc:"Para fondos claros" },
        { label:"Sin fondo",bg:CHECKER,filterVal:null,suffix:"sin-fondo",desc:"PNG transparente" },
      ].map(v=>(
        <div key={v.suffix} style={{ textAlign:"center" }}>
          <div style={{ width:120,height:90,borderRadius:10,background:v.bg,display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #2a2a2a" }}>
            <img src={logoSrc} alt="" style={{ maxWidth:"75%",maxHeight:"70%",objectFit:"contain",filter:v.filterVal==="white"?"brightness(0) invert(1)":v.filterVal==="black"?"brightness(0)":"none" }} />
          </div>
          <div style={{ fontSize:11,color:"#aaa",marginTop:6 }}>{v.label}</div>
          <div style={{ fontSize:9,color:"#555",marginBottom:4 }}>{v.desc}</div>
          {isPro&&<Btn small onClick={()=>handleDownloadLogoVersion(v.filterVal,v.suffix)}>↓ PNG 1024px</Btn>}
        </div>
      ))}
    </div>
  );

  const templates = [
    { type:"post",name:"Post informativo",size:"1080×1080",desc:"Título + cuerpo + CTA" },
    { type:"story",name:"Story promocional",size:"1080×1920",desc:"Oferta o novedad" },
    { type:"cover",name:"Portada Facebook",size:"1640×924",desc:"Header de página" },
  ];

  return (
    <div style={{ padding:"32px 20px",maxWidth:680,margin:"0 auto" }}>
      <div style={{ display:"flex",alignItems:"center",gap:20,marginBottom:40,padding:24,borderRadius:16,background:"#111",border:"1px solid #1a1a1a" }}>
        <img src={logoSrc} alt="" style={{ width:56,height:56,objectFit:"contain",borderRadius:8,background:CHECKER,padding:8 }} />
        <div style={{ flex:1 }}>
          <h2 style={{ fontSize:22,fontWeight:700,color:"#fafafa",margin:0,fontFamily:"'Space Grotesk', sans-serif" }}>Kit de marca — {brandName}</h2>
          <p style={{ fontSize:13,color:"#888",margin:"4px 0 0" }}>{industry} · {personality}{audience?` · ${audience}`:""}</p>
        </div>
        {isPro&&<span style={{ fontSize:11,padding:"4px 12px",borderRadius:20,background:"rgba(80,200,120,0.15)",color:"#50c878",fontWeight:700 }}>PRO</span>}
      </div>

      {/* Palette */}
      <Section title="Paleta de colores">
        <div style={{ display:"flex",flexWrap:"wrap",gap:16 }}>
          {Object.entries(palette).map(([k,v])=>(
            <div key={k} style={{ textAlign:"center" }}>
              <div style={{ width:80,height:80,borderRadius:12,background:v,border:"1px solid rgba(255,255,255,0.08)",boxShadow:"0 2px 8px rgba(0,0,0,0.3)" }} />
              <div style={{ fontSize:11,color:"#999",marginTop:6,fontFamily:"monospace" }}>{v.toUpperCase()}</div>
              <div style={{ fontSize:10,color:"#666" }}>{k.charAt(0).toUpperCase()+k.slice(1)}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Typography */}
      <Section title="Tipografías">
        <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
          <div style={{ padding:20,borderRadius:12,background:"#111",border:"1px solid #1a1a1a" }}>
            <div style={{ fontSize:11,color:"#888",marginBottom:6,textTransform:"uppercase",letterSpacing:1 }}>Display / Títulos</div>
            <div style={{ fontFamily:`'${f.display}',serif`,fontSize:32,fontWeight:700,color:"#fafafa" }}>{f.display}</div>
            <div style={{ fontFamily:`'${f.display}',serif`,fontSize:18,color:"#bbb",marginTop:4 }}>Aa Bb Cc Dd Ee Ff Gg 1234567890</div>
          </div>
          <div style={{ padding:20,borderRadius:12,background:"#111",border:"1px solid #1a1a1a" }}>
            <div style={{ fontSize:11,color:"#888",marginBottom:6,textTransform:"uppercase",letterSpacing:1 }}>Body / Texto</div>
            <div style={{ fontFamily:`'${f.body}',sans-serif`,fontSize:24,color:"#fafafa" }}>{f.body}</div>
            <div style={{ fontFamily:`'${f.body}',sans-serif`,fontSize:15,color:"#bbb",marginTop:4,lineHeight:1.6 }}>La tipografía correcta transmite profesionalismo y coherencia.</div>
          </div>
          <div style={{ display:"flex",gap:0,borderRadius:10,overflow:"hidden",border:"1px solid #2a2a2a" }}>
            <div style={{ flex:1,padding:16,textAlign:"center",background:palette.primary }}>
              <div style={{ fontFamily:`'${f.display}',serif`,fontSize:28,fontWeight:700,color:contrastColor(palette.primary) }}>Aa</div>
              <div style={{ fontSize:10,color:contrastColor(palette.primary),opacity:0.7 }}>Títulos</div>
            </div>
            <div style={{ flex:1,padding:16,textAlign:"center",background:"#1a1a1a" }}>
              <div style={{ fontFamily:`'${f.body}',sans-serif`,fontSize:28,color:"#eee" }}>Aa</div>
              <div style={{ fontSize:10,color:"#999" }}>Cuerpo</div>
            </div>
            <div style={{ flex:1,padding:16,textAlign:"center",background:palette.light }}>
              <div style={{ fontFamily:`'${f.mono}',monospace`,fontSize:28,color:palette.dark }}>01</div>
              <div style={{ fontSize:10,color:palette.neutral }}>Datos</div>
            </div>
          </div>
        </div>
      </Section>

      {/* Social preview */}
      <Section title="Preview en redes">
        <div style={{ display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-end" }}>
          <SocialMockup type="post" w={180} h={180} label="Post Instagram" />
          <SocialMockup type="story" w={101} h={180} label="Story" />
          <SocialMockup type="cover" w={200} h={112} label="Portada Facebook" />
        </div>
      </Section>

      {/* PRO: Logo versions */}
      <Section title="Versiones del logo" locked proPreview={<LogoVersionsPro />}>
        <LogoVersionsPro />
        <p style={{ fontSize:12,color:"#777",marginTop:12 }}>Cada versión se descarga como PNG 1024×1024 con fondo transparente.</p>
      </Section>

      {/* PRO: Templates */}
      <Section title="Templates descargables" locked proPreview={
        <div style={{ display:"flex",gap:12 }}>{templates.map(t=>(<div key={t.type} style={{ padding:14,borderRadius:10,background:"#111",border:"1px solid #1a1a1a",textAlign:"center",flex:1 }}>
          <div style={{ fontSize:13,fontWeight:600,color:"#ccc" }}>{t.name}</div><div style={{ fontSize:10,color:"#666",marginTop:4 }}>{t.size}</div></div>))}</div>
      }>
        <div style={{ display:"flex",gap:12,flexWrap:"wrap" }}>
          {templates.map(t=>(
            <div key={t.type} style={{ padding:16,borderRadius:10,background:"#111",border:"1px solid #1a1a1a",textAlign:"center",flex:1,minWidth:150 }}>
              <div style={{ fontSize:13,fontWeight:600,color:"#ccc" }}>{t.name}</div>
              <div style={{ fontSize:10,color:"#666",marginTop:4,marginBottom:10 }}>{t.size} · {t.desc}</div>
              <Btn onClick={()=>handleDownloadTemplate(t.type)} loading={downloading===t.type}>↓ Descargar PNG</Btn>
            </div>
          ))}
        </div>
      </Section>

      {/* PRO: Mockups */}
      <Section title="Mockups de aplicación" locked proPreview={
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>{MOCKUP_TYPES.slice(0,4).map(m=>(<div key={m.name} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:"#111" }}><span style={{fontSize:20}}>{m.icon}</span><div><div style={{fontSize:12,color:"#ccc",fontWeight:600}}>{m.name}</div><div style={{fontSize:10,color:"#666"}}>{m.desc}</div></div></div>))}</div>
      }>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
          {MOCKUP_TYPES.map(m=>(
            <div key={m.name} style={{ display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderRadius:10,background:"#111",border:"1px solid #1a1a1a" }}>
              <span style={{ fontSize:24 }}>{m.icon}</span>
              <div style={{ flex:1 }}><div style={{ fontSize:13,color:"#eee",fontWeight:600 }}>{m.name}</div><div style={{ fontSize:11,color:"#777",marginTop:2 }}>{m.desc}</div></div>
              <span style={{ fontSize:10,color:"#888",padding:"3px 8px",borderRadius:8,background:"#1a1a1a" }}>Próximamente</span>
            </div>
          ))}
        </div>
      </Section>

      {/* PRO: Brand guide PDF */}
      <Section title="Guía de marca (PDF)" locked proPreview={
        <div style={{ padding:16,borderRadius:10,background:"#111",textAlign:"center" }}>
          <span style={{ fontSize:32 }}>📄</span>
          <div style={{ fontSize:13,color:"#ccc",marginTop:8 }}>Guía de 3 páginas con reglas de uso</div>
        </div>
      }>
        <div style={{ padding:20,borderRadius:12,background:"#111",border:"1px solid #1a1a1a" }}>
          <div style={{ display:"flex",alignItems:"center",gap:16,marginBottom:16 }}>
            <div style={{ width:48,height:64,borderRadius:6,background:`linear-gradient(135deg, ${palette.primary}, ${palette.secondary})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>📄</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14,fontWeight:700,color:"#eee" }}>Guía de marca — {brandName}</div>
              <div style={{ fontSize:12,color:"#888",marginTop:2 }}>PDF de 3 páginas · Paleta · Tipografías · Logo · Aplicaciones</div>
            </div>
          </div>
          <p style={{ fontSize:12,color:"#777",lineHeight:1.6,marginBottom:16 }}>Se genera y descarga automáticamente como PDF.</p>
          <Btn onClick={handleDownloadGuide} loading={generatingPDF}>
            {generatingPDF ? "⏳ Generando PDF..." : "↓ Descargar guía de marca (PDF)"}
          </Btn>
        </div>
      </Section>

      {/* CTA */}
      {!isPro&&(
        <div style={{ padding:28,borderRadius:16,textAlign:"center",background:"linear-gradient(135deg, rgba(232,168,56,0.1), rgba(232,168,56,0.02))",border:"1px solid rgba(232,168,56,0.2)",marginTop:8 }}>
          <h3 style={{ fontSize:18,color:"#fafafa",margin:"0 0 8px",fontFamily:"'Space Grotesk', sans-serif" }}>Desbloqueá tu kit completo</h3>
          <p style={{ fontSize:14,color:"#999",margin:"0 0 6px" }}>Logo en versiones · Templates descargables · Guía PDF</p>
          <p style={{ fontSize:12,color:"#666",margin:"0 0 20px" }}>Pago único · Sin suscripción · Descargá todo al instante.</p>
          <button style={{ padding:"14px 40px",borderRadius:12,border:"none",background:"#e8a838",color:"#0a0a0a",fontSize:15,fontWeight:700,cursor:"pointer" }}>Obtener Kit Pro — USD $9.99</button>
        </div>
      )}
    </div>
  );
}

// ── App ──
export default function BrandKitApp() {
  const [step, setStep] = useState("upload");
  const [logoSrc, setLogoSrc] = useState(null);
  const [colors, setColors] = useState([]);
  const [palette, setPalette] = useState(null);
  const [brandData, setBrandData] = useState(null);
  const [fonts, setFonts] = useState(null);
  const [isPro, setIsPro] = useState(false);

  const handleUpload = useCallback((src) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => { const ext = extractColors(img); setPalette(generateHarmonicPalette(ext)); setLogoSrc(src); setColors(ext); setStep("questions"); };
    img.src = src;
  }, []);

  const handleComplete = useCallback((data) => {
    setBrandData(data); setFonts(FONT_PAIRINGS[data.personality]||FONT_PAIRINGS["Profesional"]);
    setStep("generating"); setTimeout(()=>setStep("result"),5500);
  }, []);

  useEffect(() => {
    if (fonts) {
      const fams = [fonts.display,fonts.body,fonts.mono].map(f=>f.replace(/ /g,"+")).join("&family=");
      const link = document.createElement("link");
      link.href = `https://fonts.googleapis.com/css2?family=${fams}:wght@400;600;700&display=swap`;
      link.rel = "stylesheet"; document.head.appendChild(link);
    }
  }, [fonts]);

  return (
    <div style={{ minHeight:"100vh",background:"#0a0a0a",color:"#fafafa",fontFamily:"'Inter','Helvetica Neue',sans-serif" }}>
      <nav style={{ padding:"16px 24px",borderBottom:"1px solid #1a1a1a",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:28,height:28,borderRadius:6,background:"linear-gradient(135deg, #e8a838, #d4872a)" }} />
          <span style={{ fontSize:16,fontWeight:700,letterSpacing:"-0.02em",fontFamily:"'Space Grotesk', sans-serif" }}>BrandKit</span>
          <span style={{ fontSize:11,color:"#e8a838",background:"rgba(232,168,56,0.12)",padding:"2px 8px",borderRadius:10,fontWeight:600 }}>BETA</span>
        </div>
        {step==="result"&&(
          <button onClick={()=>setIsPro(!isPro)}
            style={{ fontSize:11,padding:"5px 14px",borderRadius:8,border:"1px solid",cursor:"pointer",
              borderColor:isPro?"#50c878":"#444",background:isPro?"rgba(80,200,120,0.1)":"transparent",color:isPro?"#50c878":"#999" }}>
            {isPro?"✓ Modo Pro activo":"Ver modo Pro"}
          </button>
        )}
      </nav>
      {step==="upload"&&<UploadStep onUpload={handleUpload} />}
      {step==="questions"&&<QuestionsStep logoSrc={logoSrc} colors={colors} onComplete={handleComplete} />}
      {step==="generating"&&<GeneratingStep />}
      {step==="result"&&<ResultStep brandData={brandData} palette={palette} fonts={fonts} logoSrc={logoSrc} colors={colors} isPro={isPro} />}
    </div>
  );
}
