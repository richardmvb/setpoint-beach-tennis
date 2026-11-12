const fs = require('node:fs');
const path = require('node:path');
const typescript = require('typescript');

/** Transpiles a dependency-light core module and returns its exports (relative imports resolve inside src/app/core). */
function loadCore(name, stubs = {}) {
  const file = path.join(__dirname, '../src/app/core', `${name}.ts`);
  const javascript = typescript.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
      experimentalDecorators: true,
    },
  }).outputText;
  const exported = {};
  const localRequire = (request) =>
    request in stubs ? stubs[request] : request.startsWith('./') ? loadCore(request.slice(2), stubs) : require(request);
  new Function('exports', 'require', javascript)(exported, localRequire);
  return exported;
}

class MemoryStorage {
  constructor(limit = Infinity) {
    this.map = new Map();
    this.limit = limit;
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    const used = [...this.map].reduce((sum, [k, v]) => (k === key ? sum : sum + k.length + v.length), 0);
    if (used + key.length + value.length > this.limit) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

module.exports = { loadCore, MemoryStorage };
