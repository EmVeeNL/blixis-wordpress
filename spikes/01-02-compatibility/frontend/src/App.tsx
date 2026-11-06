// Minimal nested tree: sections hold items. Items may move between sections;
// sections may only reorder among sections, so dropping one on an item is refused.
import { useCallback, useRef, useState } from "react";
import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  KeyboardCode,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { IconGripVertical } from "@tabler/icons-react";

type SectionNode = { id: string; items: string[] };
type Outcome = { tree: SectionNode[]; result: "none" | "moved" | "refused" };

const initial: SectionNode[] = [
  { id: "section-a", items: ["a1", "a2", "a3"] },
  { id: "section-b", items: ["b1"] },
  { id: "section-c", items: [] },
];

const typeOf = (id: string): "section" | "item" => (id.startsWith("section-") ? "section" : "item");

export function move(tree: SectionNode[], activeId: string, overId: string): Outcome {
  if (activeId === overId) return { tree, result: "none" };
  const type = typeOf(activeId);
  const overType = typeOf(overId);
  if (type === "section") {
    if (overType !== "section") return { tree, result: "refused" };
    const next = [...tree];
    const from = next.findIndex((s) => s.id === activeId);
    const to = next.findIndex((s) => s.id === overId);
    const [moved] = next.splice(from, 1);
    if (!moved) return { tree, result: "none" };
    next.splice(to, 0, moved);
    return { tree: next, result: "moved" };
  }
  const next = tree.map((s) => ({ ...s, items: s.items.filter((i) => i !== activeId) }));
  const source = tree.find((s) => s.items.includes(activeId));
  if (overType === "section") {
    next.find((s) => s.id === overId)?.items.push(activeId);
    return { tree: next, result: "moved" };
  }
  const target = next.find((s) => s.items.includes(overId));
  const original = tree.find((s) => s.items.includes(overId));
  if (!source || !target || !original) return { tree, result: "none" };
  const index = target.items.indexOf(overId);
  const movingDown =
    source === original && source.items.indexOf(activeId) < source.items.indexOf(overId);
  target.items.splice(movingDown ? index + 1 : index, 0, activeId);
  return { tree: next, result: "moved" };
}

// Pointer: the smallest droppable under the pointer wins, so items beat their section.
// Keyboard: there are no pointer coordinates, so use the closest center of the same type.
const collision: CollisionDetection = (args) => {
  const type = typeOf(String(args.active.id));
  if (args.pointerCoordinates) {
    const hits = pointerWithin(args);
    const area = (c: { id: string | number }): number => {
      const r = args.droppableRects.get(c.id);
      return r ? r.width * r.height : Infinity;
    };
    return [...hits].sort((a, b) => area(a) - area(b));
  }
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) =>
        typeOf(String(c.id)) === type ||
        (type === "item" && c.id !== args.active.id && typeOf(String(c.id)) === "section"),
    ),
  });
};

// Moves the dragged element to the next target in reading order. An item's
// targets are other items plus empty sections, so empty sections stay reachable.
const keyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { active, currentCoordinates, context },
) => {
  if (event.code !== KeyboardCode.Down && event.code !== KeyboardCode.Up) return undefined;
  event.preventDefault();
  const type = typeOf(String(active));
  const rect = context.collisionRect;
  if (!rect) return undefined;
  const down = event.code === KeyboardCode.Down;
  const targets = context.droppableContainers
    .getEnabled()
    .filter(
      (c) =>
        c.id !== active &&
        (typeOf(String(c.id)) === type || (type === "item" && c.data.current?.empty === true)),
    )
    .flatMap((c) => context.droppableRects.get(c.id) ?? [])
    .filter((r) => (down ? r.top > rect.top + 1 : r.top < rect.top - 1))
    .sort((a, b) => (down ? a.top - b.top : b.top - a.top));
  const target = targets[0];
  if (!target) return currentCoordinates;
  return { x: currentCoordinates.x, y: currentCoordinates.y + (target.top - rect.top) };
};

function Item({ id }: { id: string }) {
  const drag = useDraggable({ id });
  const drop = useDroppable({ id });
  const ref = useCallback(
    (node: HTMLElement | null) => {
      drag.setNodeRef(node);
      drop.setNodeRef(node);
    },
    [drag.setNodeRef, drop.setNodeRef],
  );
  const style = drag.transform
    ? { transform: `translate(${drag.transform.x}px, ${drag.transform.y}px)` }
    : undefined;
  return (
    <li
      ref={ref}
      style={{ ...style, padding: 8, margin: "4px 0", background: "#eef" }}
      data-testid={`item-${id}`}
    >
      <button
        type="button"
        {...drag.attributes}
        {...drag.listeners}
        data-testid={`handle-${id}`}
        aria-label={`Move ${id}`}
      >
        <IconGripVertical size={14} aria-hidden="true" /> {id}
      </button>
    </li>
  );
}

function Section({ section }: { section: SectionNode }) {
  const drag = useDraggable({ id: section.id });
  const drop = useDroppable({ id: section.id, data: { empty: section.items.length === 0 } });
  const ref = useCallback(
    (node: HTMLElement | null) => {
      drag.setNodeRef(node);
      drop.setNodeRef(node);
    },
    [drag.setNodeRef, drop.setNodeRef],
  );
  const style = drag.transform
    ? { transform: `translate(${drag.transform.x}px, ${drag.transform.y}px)` }
    : undefined;
  return (
    <section
      ref={ref}
      style={{
        ...style,
        border: "1px solid #999",
        padding: 12,
        margin: "12px 0",
        minHeight: 60,
        background: "#fff",
      }}
      data-testid={section.id}
      aria-label={section.id}
    >
      <button
        type="button"
        {...drag.attributes}
        {...drag.listeners}
        data-testid={`handle-${section.id}`}
        aria-label={`Move ${section.id}`}
      >
        <IconGripVertical size={14} aria-hidden="true" /> {section.id}
      </button>
      <ul style={{ listStyle: "none", padding: 0, minHeight: 20 }}>
        {section.items.map((id) => (
          <Item key={id} id={id} />
        ))}
      </ul>
    </section>
  );
}

const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${active.id}.`,
  onDragOver: ({ active, over }) =>
    over ? `${active.id} is over ${over.id}.` : `${active.id} is not over a target.`,
  onDragEnd: ({ active, over }) =>
    over ? `Dropped ${active.id} on ${over.id}.` : `Dropped ${active.id}.`,
  onDragCancel: ({ active }) => `Cancelled moving ${active.id}.`,
};

export function App() {
  const [tree, setTree] = useState(initial);
  const [result, setResult] = useState("idle");
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  return (
    <main style={{ width: 420, maxWidth: "100%", margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 18 }}>Nested drag and drop proof</h1>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        accessibility={{ announcements }}
        onDragCancel={() => setResult("cancelled")}
        onDragEnd={({ active, over }) => {
          if (!over) {
            setResult("no-target");
            return;
          }
          const outcome = move(treeRef.current, String(active.id), String(over.id));
          setTree(outcome.tree);
          setResult(outcome.result);
        }}
      >
        {tree.map((section) => (
          <Section key={section.id} section={section} />
        ))}
      </DndContext>
      <p role="status" data-testid="result">
        {result}
      </p>
      <pre data-testid="state">{JSON.stringify(tree)}</pre>
    </main>
  );
}
