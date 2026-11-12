const fs = require('node:fs');
const path = require('node:path');
const typescript = require('typescript');

/** Loads a TypeScript module (and the relative .ts files it imports) for node:test, with Angular and Supabase stubbed. */
function loadTs(file, stubs = {}) {
  const defaults = {
    '@angular/core': { Injectable: () => (target) => target },
    '@supabase/supabase-js': { REALTIME_SUBSCRIBE_STATES: {} },
  };
  const cache = new Map();
  function load(absolute) {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const javascript = typescript.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: {
        module: typescript.ModuleKind.CommonJS,
        target: typescript.ScriptTarget.ES2022,
        experimentalDecorators: true,
      },
    }).outputText;
    new Function('require', 'exports', 'module', javascript)(
      (name) => {
        if (name in stubs) return stubs[name];
        if (name in defaults) return defaults[name];
        if (name.startsWith('.')) {
          const target = path.resolve(path.dirname(absolute), name);
          const resolved = [`${target}.ts`, path.join(target, 'index.ts')].find((candidate) =>
            fs.existsSync(candidate),
          );
          if (resolved) return load(resolved);
        }
        return require(name);
      },
      module.exports,
      module,
    );
    return module.exports;
  }
  return load(path.resolve(file));
}

module.exports = { loadTs };
