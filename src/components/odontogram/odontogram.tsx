'use client';
import { memo } from 'react';

/**
 * Odontograma FDI (formato del presupuesto físico):
 *   fila 1: 1.8–1.1 | 2.1–2.8   (permanentes superiores)
 *   fila 2: 5.5–5.1 | 6.1–6.5   (temporales superiores)
 *   fila 3: 8.5–8.1 | 7.1–7.5   (temporales inferiores)
 *   fila 4: 4.8–4.1 | 3.1–3.8   (permanentes inferiores)
 * Cada pieza tiene 5 superficies: O (centro), V/L (arriba/abajo según arcada) y M/D (según cuadrante).
 */
export type Surface = 'O' | 'V' | 'L' | 'M' | 'D';
export type Mark = { toothCode: string; surface: Surface | null; conditionId: string };
export type Condition = { id: string; code: string; name: string; color: string; scope: 'surface' | 'tooth'; symbol: string };
export type Selection = { toothCode: string; surfaces: Surface[] } | null;

const R = (from: number, to: number, q: number) => {
  const out: string[] = [];
  const step = from > to ? -1 : 1;
  for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(`${q}.${i}`);
  return out;
};
export const ROWS = [
  { left: R(8, 1, 1), right: R(1, 8, 2), upper: true },
  { left: R(5, 1, 5), right: R(1, 5, 6), upper: true },
  { left: R(5, 1, 8), right: R(1, 5, 7), upper: false },
  { left: R(8, 1, 4), right: R(1, 8, 3), upper: false },
];

const S = 36;          // tamaño de pieza
const GAP = 6;         // separación entre piezas
const MID = 22;        // separación en la línea media
const ROW_H = 74;      // alto de fila (número + pieza)
const W = 16 * (S + GAP) + MID;
const H = ROWS.length * ROW_H + 44;

/** Qué superficie corresponde a cada lado del glifo según el cuadrante */
function sideMap(toothCode: string): Record<'top' | 'bottom' | 'left' | 'right' | 'center', Surface> {
  const q = Number(toothCode[0]);
  const upper = [1, 2, 5, 6].includes(q);
  const patientRight = [1, 4, 5, 8].includes(q); // se dibuja a la izquierda: mesial queda a la derecha
  return {
    top: upper ? 'V' : 'L',
    bottom: upper ? 'L' : 'V',
    left: patientRight ? 'D' : 'M',
    right: patientRight ? 'M' : 'D',
    center: 'O',
  };
}

type Props = {
  marks: Mark[];
  conditions: Condition[];
  selection?: Selection;
  /** piezas con tratamiento en el presupuesto (se resaltan) */
  planned?: Set<string>;
  readOnly?: boolean;
  onSurfaceClick?: (toothCode: string, surface: Surface) => void;
  onToothClick?: (toothCode: string) => void;
};

function OdontogramBase({ marks, conditions, selection, planned, readOnly, onSurfaceClick, onToothClick }: Props) {
  const byId = new Map(conditions.map((c) => [c.id, c]));
  const marksByTooth = new Map<string, Mark[]>();
  for (const m of marks) marksByTooth.set(m.toothCode, [...(marksByTooth.get(m.toothCode) ?? []), m]);

  const xFor = (row: (typeof ROWS)[number], side: 'left' | 'right', i: number) => {
    // las filas temporales (5 piezas por lado) se centran bajo las permanentes
    const offset = row.left.length === 5 ? 3 * (S + GAP) : 0;
    return side === 'left'
      ? offset + i * (S + GAP)
      : 8 * (S + GAP) + MID + i * (S + GAP);
  };

  const tooth = (code: string, x: number, y: number, numberAbove: boolean) => {
    const map = sideMap(code);
    const tm = marksByTooth.get(code) ?? [];
    const surfaceFill = (s: Surface) => {
      const m = tm.find((k) => k.surface === s && byId.get(k.conditionId)?.scope === 'surface');
      return m ? byId.get(m.conditionId)!.color : null;
    };
    const selected = selection?.toothCode === code ? new Set(selection.surfaces) : null;
    const toothMarks = tm.filter((k) => !k.surface || byId.get(k.conditionId)?.scope === 'tooth').map((k) => byId.get(k.conditionId)).filter(Boolean) as Condition[];
    const inner = S * 0.3;
    const a = inner, b = S - inner;
    const polys: { side: keyof typeof map; points: string }[] = [
      { side: 'top', points: `0,0 ${S},0 ${b},${a} ${a},${a}` },
      { side: 'bottom', points: `0,${S} ${S},${S} ${b},${b} ${a},${b}` },
      { side: 'left', points: `0,0 ${a},${a} ${a},${b} 0,${S}` },
      { side: 'right', points: `${S},0 ${b},${a} ${b},${b} ${S},${S}` },
      { side: 'center', points: `${a},${a} ${b},${a} ${b},${b} ${a},${b}` },
    ];
    const numY = numberAbove ? y - 8 : y + S + 16;
    const isPlanned = planned?.has(code);
    return (
      <g key={code} data-tooth={code}>
        <text x={x + S / 2} y={numY} textAnchor="middle" fontSize="11" fontWeight={isPlanned || selected ? 700 : 500}
          fill={selected ? 'var(--brand)' : isPlanned ? 'var(--accent)' : 'var(--text-muted)'}
          className={readOnly ? undefined : 'cursor-pointer'} onClick={readOnly ? undefined : () => onToothClick?.(code)}>
          {code}
        </text>
        <g transform={`translate(${x},${y})`}>
          {polys.map((p) => {
            const surf = map[p.side];
            const fill = selected?.has(surf) ? 'var(--brand)' : surfaceFill(surf) ?? 'var(--surface)';
            return (
              <polygon key={p.side} points={p.points} fill={fill} fillOpacity={selected?.has(surf) ? 0.55 : 1}
                stroke="var(--border-strong)" strokeWidth={1}
                className={readOnly ? undefined : 'cursor-pointer hover:opacity-70'}
                onClick={readOnly ? undefined : () => onSurfaceClick?.(code, surf)}>
                <title>{`Pieza ${code} · ${surf}`}</title>
              </polygon>
            );
          })}
          {isPlanned && <rect x={-2} y={-2} width={S + 4} height={S + 4} rx={3} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" pointerEvents="none" />}
          {toothMarks.map((c, i) => <ToothSymbol key={i} c={c} />)}
        </g>
      </g>
    );
  };

  return (
    <svg viewBox={`-8 -4 ${W + 16} ${H}`} className="w-full min-w-[640px] select-none" role="img" aria-label="Odontograma">
      <text x={W / 2} y={10} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--text-muted)">BUCAL</text>
      <text x={W / 2} y={H - 12} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--text-muted)">BUCAL</text>
      <line x1={8 * (S + GAP) + MID / 2 - GAP / 2} y1={22} x2={8 * (S + GAP) + MID / 2 - GAP / 2} y2={H - 30} stroke="var(--border-strong)" strokeWidth={2} />
      <line x1={0} y1={2 * ROW_H + 30} x2={W - GAP} y2={2 * ROW_H + 30} stroke="var(--border-strong)" strokeWidth={2} />
      <rect x={W / 2 - 34} y={2 * ROW_H + 21} width={68} height={16} fill="var(--surface)" /><text x={W / 2} y={2 * ROW_H + 34} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--text-muted)">LINGUAL</text>
      <text x={-2} y={H / 2} fontSize="10" fill="var(--text-subtle)" writingMode="vertical-rl" textAnchor="middle">DERECHA</text>
      <text x={W + 4} y={H / 2} fontSize="10" fill="var(--text-subtle)" writingMode="vertical-rl" textAnchor="middle">IZQUIERDA</text>
      {ROWS.map((row, r) => {
        const y = 34 + r * ROW_H + (r >= 2 ? 20 : 0);
        return (
          <g key={r}>
            {row.left.map((c, i) => tooth(c, xFor(row, 'left', i), y, true))}
            {row.right.map((c, i) => tooth(c, xFor(row, 'right', i), y, true))}
          </g>
        );
      })}
    </svg>
  );
}

function ToothSymbol({ c }: { c: Condition }) {
  const common = { stroke: c.color, strokeWidth: 2.5, fill: 'none', pointerEvents: 'none' as const };
  switch (c.symbol) {
    case 'cross':
      return <g {...common}><line x1={2} y1={2} x2={S - 2} y2={S - 2} /><line x1={S - 2} y1={2} x2={2} y2={S - 2} /></g>;
    case 'circle':
      return <circle cx={S / 2} cy={S / 2} r={S / 2 + 1} {...common} />;
    case 'ellipse':
      return <ellipse cx={S / 2} cy={S / 2} rx={S / 2 - 1} ry={S / 4} {...common} />;
    case 'line':
      return <line x1={S / 2} y1={-4} x2={S / 2} y2={S + 4} {...common} />;
    case 'zigzag':
      return <polyline points={`2,${S / 2} ${S * 0.3},${S * 0.3} ${S * 0.5},${S * 0.7} ${S * 0.7},${S * 0.3} ${S - 2},${S / 2}`} {...common} />;
    default:
      return null;
  }
}

export const Odontogram = memo(OdontogramBase);

/** Convierte ítems de catálogo TOOTH_CONDITION a condiciones del odontograma */
export function toConditions(items: { id: string; code: string; name: string; value: string | null }[]): Condition[] {
  return items.map((i) => {
    let v: { color?: string; scope?: string; symbol?: string } = {};
    try { v = JSON.parse(i.value ?? '{}'); } catch { /* valor inválido */ }
    return { id: i.id, code: i.code, name: i.name, color: v.color ?? '#DC2626', scope: v.scope === 'tooth' ? 'tooth' : 'surface', symbol: v.symbol ?? 'fill' };
  });
}

export function OdontogramLegend({ conditions }: { conditions: Condition[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {conditions.map((c) => (
        <li key={c.id} className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            {c.scope === 'surface' ? <rect width="14" height="14" rx="2" fill={c.color} /> :
              c.symbol === 'cross' ? <g stroke={c.color} strokeWidth="2"><line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" /></g> :
              c.symbol === 'ellipse' ? <ellipse cx="7" cy="7" rx="6" ry="3.5" fill="none" stroke={c.color} strokeWidth="2" /> :
              c.symbol === 'line' ? <line x1="7" y1="0" x2="7" y2="14" stroke={c.color} strokeWidth="2" /> :
              <circle cx="7" cy="7" r="5.5" fill="none" stroke={c.color} strokeWidth="2" />}
          </svg>
          {c.name}
        </li>
      ))}
    </ul>
  );
}
