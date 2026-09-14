import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Metadata and model imports must initialize in either order, without a DOM.
for (const firstModule of ["species", "createFish"]) {
  const server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  try {
    await server.ssrLoadModule(`/src/sakana/${firstModule}.ts`);
    const { species } = await server.ssrLoadModule("/src/sakana/species.ts");
    const { createFish } = await server.ssrLoadModule(
      "/src/sakana/createFish.ts",
    );
    const { fishDefinitions, getFishDefinition } = await server.ssrLoadModule(
      "/src/sakana/registry.ts",
    );
    const ids = fishDefinitions.map(({ species: spec }) => spec.id);
    assert.ok(ids.length > 0, "The collection must contain registered fish");
    assert.equal(new Set(ids).size, ids.length, "Fish IDs must be unique");
    assert.deepEqual(
      Object.keys(species),
      ids,
      "Collection order must match available models",
    );
    for (const definition of fishDefinitions) {
      assert.equal(getFishDefinition(definition.species.id), definition);
      assert.equal(species[definition.species.id], definition.species);
      assert.equal(typeof definition.create, "function");
    }

    // Replace only the factory boundary to observe dispatch independently of geometry.
    const originals = fishDefinitions.map(({ create }) => create);
    const calls = [];
    const models = fishDefinitions.map(() => ({ group: {} }));
    try {
      fishDefinitions.forEach((definition, index) => {
        definition.create = (spec) => {
          calls.push({ index, spec });
          return models[index];
        };
      });
      fishDefinitions.forEach((definition, index) => {
        const spec = {
          ...definition.species,
          shape: { ...definition.species.shape, length: 1.73 },
          motion: { frequency: 2.81, amplitude: 0.123 },
        };
        const previousCalls = calls.length;
        assert.equal(
          createFish(spec),
          models[index],
          `${spec.id}: wrong factory result`,
        );
        assert.equal(
          calls.length,
          previousCalls + 1,
          `${spec.id}: multiple factories ran`,
        );
        assert.equal(
          calls.at(-1).index,
          index,
          `${spec.id}: selected another species`,
        );
        assert.equal(
          calls.at(-1).spec,
          spec,
          `${spec.id}: caller customizations were replaced`,
        );
      });
      const previousCalls = calls.length;
      for (const id of ["missing-fish", "__proto__", "constructor"]) {
        assert.equal(getFishDefinition(id), undefined);
        assert.throws(
          () => createFish({ ...fishDefinitions[0].species, id }),
          { message: `Unsupported fish species: ${id}` },
          "An unknown ID must not fall back to a fish with the same body family",
        );
      }
      assert.equal(
        calls.length,
        previousCalls,
        "Unknown fish invoked a factory",
      );
    } finally {
      fishDefinitions.forEach((definition, index) => {
        definition.create = originals[index];
      });
    }
  } finally {
    await server.close();
  }
}
console.log(
  "Fish registry: import order, metadata, unique IDs, dispatch, caller overrides and unknown IDs passed",
);
