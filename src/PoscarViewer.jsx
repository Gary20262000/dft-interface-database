import React, { useEffect, useMemo, useState } from "react";

const COLORS = {
  Pt: "#94a3b8",
  Ni: "#22c55e",
  O: "#ef4444",
  H: "#e5e7eb",
  Co: "#3b82f6",
  Cu: "#f97316",
  Zn: "#a855f7",
  Au: "#facc15",
};

const SPACE_RADII = {
  Pt: 13,
  Ni: 11,
  O: 9,
  H: 5,
  Co: 11,
  Cu: 11,
  Zn: 11,
  Au: 13,
};

const BALL_RADII = {
  Pt: 7,
  Ni: 6,
  O: 5,
  H: 3,
  Co: 6,
  Cu: 6,
  Zn: 6,
  Au: 7,
};

const COVALENT_RADII = {
  H: 0.31,
  O: 0.66,
  Ni: 1.24,
  Pt: 1.36,
  Co: 1.26,
  Cu: 1.32,
  Zn: 1.22,
  Au: 1.36,
};

function fracToCart(frac, lattice) {
  const [u, v, w] = frac;
  return [
    u * lattice[0][0] + v * lattice[1][0] + w * lattice[2][0],
    u * lattice[0][1] + v * lattice[1][1] + w * lattice[2][1],
    u * lattice[0][2] + v * lattice[1][2] + w * lattice[2][2],
  ];
}

function parsePoscar(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 8) throw new Error("POSCAR is too short.");

  const scale = Number(lines[1]);
  if (!Number.isFinite(scale)) throw new Error("Scale factor is missing or invalid.");

  const lattice = [
    lines[2].split(/\s+/).slice(0, 3).map(Number).map((x) => x * scale),
    lines[3].split(/\s+/).slice(0, 3).map(Number).map((x) => x * scale),
    lines[4].split(/\s+/).slice(0, 3).map(Number).map((x) => x * scale),
  ];

  const elements = lines[5].split(/\s+/);
  const counts = lines[6].split(/\s+/).map(Number);

  let coordStart = 7;

  if (lines[coordStart].toLowerCase().startsWith("s")) {
    coordStart += 1;
  }

  const mode = lines[coordStart].toLowerCase();
  const isDirect = mode.startsWith("d");

  coordStart += 1;

  const atoms = [];
  let atomCounter = 0;

  elements.forEach((element, elementIndex) => {
    const count = counts[elementIndex];

    for (let i = 0; i < count; i++) {
      const line = lines[coordStart + atomCounter];
      if (!line) throw new Error("Missing coordinate lines.");

      const raw = line.split(/\s+/).slice(0, 3).map(Number);
      const cart = isDirect ? fracToCart(raw, lattice) : raw.map((x) => x * scale);

      atoms.push({
        element,
        x: cart[0],
        y: cart[1],
        z: cart[2],
      });

      atomCounter += 1;
    }
  });

  return atoms;
}

function distance3D(a, b) {
  return Math.sqrt(
    (a.x - b.x) ** 2 +
    (a.y - b.y) ** 2 +
    (a.z - b.z) ** 2
  );
}

function shouldBond(a, b) {
  const r1 = COVALENT_RADII[a.element] || 1.0;
  const r2 = COVALENT_RADII[b.element] || 1.0;
  const cutoff = r1 + r2 + 0.55;
  const d = distance3D(a, b);

  // Avoid drawing super long slab connections.
  return d > 0.45 && d < cutoff;
}

function makeBonds(atoms) {
  const bonds = [];

  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      if (shouldBond(atoms[i], atoms[j])) {
        bonds.push([i, j]);
      }
    }
  }

  return bonds;
}

function normalizeAtoms(atoms, width, height, view) {
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => (view === "top" ? a.y : a.z));

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const padding = 55;

  return atoms.map((atom) => {
    const rawY = view === "top" ? atom.y : atom.z;

    return {
      ...atom,
      sx: padding + ((atom.x - minX) / rangeX) * (width - padding * 2),
      sy: height - padding - ((rawY - minY) / rangeY) * (height - padding * 2),
    };
  });
}

export default function PoscarViewer({ systemName, poscarFile }) {
  const [atoms, setAtoms] = useState([]);
  const [status, setStatus] = useState("Loading POSCAR...");
  const [view, setView] = useState("top");
  const [mode, setMode] = useState("space");

  useEffect(() => {
    async function load() {
      try {
        const fileUrl = `${import.meta.env.BASE_URL}${poscarFile}`;
        const response = await fetch(fileUrl);

        if (!response.ok) {
          throw new Error(`Could not load ${fileUrl}`);
        }

        const text = await response.text();

        if (text.includes("<html") || text.includes("<!doctype")) {
          throw new Error("Loaded webpage instead of POSCAR. File path is wrong.");
        }

        const parsedAtoms = parsePoscar(text);
        setAtoms(parsedAtoms);
        setStatus(`${parsedAtoms.length} atoms loaded from ${poscarFile}`);
      } catch (error) {
        setAtoms([]);
        setStatus(error.message);
      }
    }

    load();
  }, [poscarFile]);

  const width = 760;
  const height = 480;

  const shownAtoms = useMemo(
    () => normalizeAtoms(atoms, width, height, view),
    [atoms, view]
  );

  const bonds = useMemo(() => makeBonds(atoms), [atoms]);

  const radii = mode === "space" ? SPACE_RADII : BALL_RADII;

  return (
    <div className="poscarViewerShell">
      <div className="viewerToolbar">
        <button
          className={view === "top" ? "viewerButton active" : "viewerButton"}
          onClick={() => setView("top")}
        >
          Top view
        </button>

        <button
          className={view === "side" ? "viewerButton active" : "viewerButton"}
          onClick={() => setView("side")}
        >
          Side view
        </button>

        <button
          className={mode === "space" ? "viewerButton active" : "viewerButton"}
          onClick={() => setMode("space")}
        >
          Space filling
        </button>

        <button
          className={mode === "ballstick" ? "viewerButton active" : "viewerButton"}
          onClick={() => setMode("ballstick")}
        >
          Ball and stick
        </button>
      </div>

      <svg className="poscarSvg" viewBox={`0 0 ${width} ${height}`}>
        <rect x="0" y="0" width={width} height={height} rx="18" fill="#f8fafc" />

        {mode === "ballstick" &&
          bonds.map(([i, j], index) => {
            const a = shownAtoms[i];
            const b = shownAtoms[j];

            if (!a || !b) return null;

            return (
              <line
                key={`bond-${index}`}
                x1={a.sx}
                y1={a.sy}
                x2={b.sx}
                y2={b.sy}
                stroke="#475569"
                strokeWidth="2.2"
                opacity="0.65"
              />
            );
          })}

        {shownAtoms
          .slice()
          .sort((a, b) => a.z - b.z)
          .map((atom, index) => (
            <g key={index}>
              <circle
                cx={atom.sx}
                cy={atom.sy}
                r={radii[atom.element] || (mode === "space" ? 10 : 5)}
                fill={COLORS[atom.element] || "#64748b"}
                stroke="#0f172a"
                strokeWidth={mode === "space" ? "0.5" : "1"}
                opacity={mode === "space" ? "0.78" : "0.95"}
              />
            </g>
          ))}
      </svg>

      <div className="legendRow">
        {[...new Set(atoms.map((a) => a.element))].map((el) => (
          <span className="legendItem" key={el}>
            <span
              className="legendDot"
              style={{ background: COLORS[el] || "#64748b" }}
            />
            {el}
          </span>
        ))}
      </div>

      <div className="poscarViewerStatus">{status}</div>
    </div>
  );
}