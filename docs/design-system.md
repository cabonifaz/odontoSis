# Design System — OdontoSis

Estilo clínico, sobrio y legible. Tailwind CSS v4 con tokens en CSS ([globals.css](../src/app/globals.css)). Soporta modo claro y oscuro (`prefers-color-scheme` o `data-theme`).

## Tokens

### Color
| Token | Uso | Clase |
|---|---|---|
| `--brand` | Color principal **de cada clínica** (se inyecta en runtime desde `tenant.primary_color`) | `bg-brand`, `text-brand` |
| `--accent` | Color secundario de la clínica (piezas con tratamiento planificado) | `text-accent` |
| `--brand-soft` / `--brand-hover` | Derivados con `color-mix` (fondos activos, hover) | `bg-brand-soft`, `hover:bg-brand-hover` |
| `--brand-contrast` | Texto sobre `--brand`, calculado por luminancia | `text-brand-contrast` |
| `--bg`, `--surface`, `--surface-2` | Fondo de app, tarjetas y zonas secundarias | `bg-bg`, `bg-surface`, `bg-surface-2` |
| `--border`, `--border-strong` | Bordes | `border-line`, `border-line-strong` |
| `--text`, `--text-muted`, `--text-subtle` | Texto | `text-fg`, `text-muted`, `text-subtle` |
| `--success`, `--warning`, `--danger`, `--info` | Estados semánticos | `text-success` … |

Los colores de estado de los catálogos (citas, presupuestos, clínicas) viven en `master_item.value` y se pintan con `<Badge color>`.

### Tipografía
Inter (`next/font`). Escala: `text-xs` 12 · `text-sm` 14 (cuerpo) · `text-base` 16 · `text-lg` 18 (títulos de modal) · `text-2xl` 24 (título de página). Montos con `tabular-nums`; códigos (H.C., piezas) en `font-mono`.

### Espaciado, radios y elevación
Escala de 4 px de Tailwind. Gutter de página `px-4` (móvil) / `px-8` (desktop).
`--radius-control` 8 px (inputs y botones) · `--radius-card` 14 px (tarjetas y modales).
`shadow-card` (reposo) · `shadow-pop` (menús, toasts) · `shadow-modal`.

## Componentes ([components/ui](../src/components/ui/index.tsx))
| Componente | Variantes / notas |
|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `danger` · tamaños `sm/md/lg` · estado `loading` (aria-busy) |
| `Input`, `Select`, `Textarea`, `Field` | Label asociado, `required`, `error` (role=alert, aria-invalid), `hint` |
| `Checkbox` | Usa el color de marca (`accent-color`) |
| `Card`, `Stat`, `PageHeader`, `EmptyState`, `Spinner` | Layout y estados vacíos/carga |
| `Badge` | Color dinámico con fondo al 12 % |
| `Modal` | `<dialog>` nativo: foco atrapado, Esc, backdrop |
| `Table/Th/Td` | En móvil cada fila pasa a tarjeta (`data-label`) |
| `Tabs` | `role=tablist`, `aria-selected` |
| `useToast` | `success`, `error`, `info` con `aria-live` |
| `PatientPicker`, `ServicePicker` | Combobox accesible (teclado ↑↓ Enter Esc) sobre datos locales (sirve offline) |

## Patrón: Odontograma ([components/odontogram](../src/components/odontogram/odontogram.tsx))
- Numeración FDI en 4 filas (permanentes y temporales), con BUCAL/LINGUAL y DERECHA/IZQUIERDA como en el formato físico.
- Cada pieza tiene 5 superficies clicables: O (centro) · V/L (arriba/abajo según arcada) · M/D (según cuadrante; mesial hacia la línea media).
- Hallazgos desde el catálogo `TOOTH_CONDITION`: `{"color","scope":"surface|tooth","symbol":"fill|cross|circle|ellipse|line|zigzag"}`. Se pueden agregar hallazgos nuevos sin tocar código.
- Estados: selección (marca de 55 %), pieza con tratamiento planificado (contorno punteado `--accent`), solo lectura (impresión).
- En pantallas angostas se desplaza horizontalmente (mín. 640 px) para mantener áreas táctiles útiles.

## Responsive
Mobile-first. El sidebar fijo (`lg`) pasa a drawer en móvil. Las tablas se muestran como tarjetas, la agenda usa vista día en móvil y los formularios usan grid `sm:grid-cols-2`. Las pruebas E2E verifican que no haya scroll horizontal.
