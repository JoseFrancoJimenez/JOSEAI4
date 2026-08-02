import type { ITocNodeDef } from "@mini/lib/widgets";

/**
 * A 5-generation family tree (first names only) — exercises the TOC widget at its
 * deepest supported nesting: depth 0 (root) through depth 4 (5 levels).
 *
 *  Alice                    Diana
 *  ├─ Bob                   └─ Ethan
 *  │  ├─ Frank                 └─ Henry
 *  │  │  └─ Irene                 └─ Jack
 *  │  │     └─ Karen                  └─ Liam
 *  │  └─ Grace
 *  └─ Carol
 */
function people(): ITocNodeDef[] {
  return [
    { id: "Alice", parent_id: null, type: "person" },
    { id: "Bob", parent_id: "Alice", type: "person" },
    { id: "Carol", parent_id: "Alice", type: "person" },
    { id: "Frank", parent_id: "Bob", type: "person" },
    { id: "Grace", parent_id: "Bob", type: "person" },
    { id: "Irene", parent_id: "Frank", type: "person" },
    { id: "Karen", parent_id: "Irene", type: "person" },

    { id: "Diana", parent_id: null, type: "person" },
    { id: "Ethan", parent_id: "Diana", type: "person" },
    { id: "Henry", parent_id: "Ethan", type: "person" },
    { id: "Jack", parent_id: "Henry", type: "person" },
    { id: "Liam", parent_id: "Jack", type: "person" },
  ];
}

export { people };
