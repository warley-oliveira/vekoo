module MiniRacerEngine
  # Endurecimento do contexto, carregado antes de tudo. Existe por causa de buracos que
  # só apareceram rodando scripts de verdade no V8 da gem 0.22:
  #
  # `max_memory` é um callback pós-GC sobre `used_heap_size`. Ele não conta ArrayBuffer e
  # typed arrays, que ficam fora do heap: `new Uint8Array(1e8).fill(1)` em laço levava o
  # processo a 4 GB com o limite em 64 MB. Daí a cota `MAX_BINARY_BYTES`, cobrada nos
  # construtores e nos métodos que alocam direto, sem passar por eles.
  #
  # Alguns builtins em C++ varrem a entrada inteira sem voltar ao JS, então nem o GC nem o
  # timeout os alcançam. Com entrada gigante, ou o V8 aborta o PROCESSO (`s.match(/x/g)`,
  # `JSON.parse`, `new Array(2**29).fill(0)`: `Fatal JavaScript invalid size error`), ou a
  # thread fica presa muito além do prazo (`a.length = 2**29; a.sort()`). Daí o teto
  # `MAX_COLLECTION_ITEMS` na entrada desses métodos: nada desse tamanho caberia no limite de
  # memória de qualquer forma.
  #
  # Isto fecha o que dá para esbarrar sem querer e todo vetor que a spec cobre, não é uma
  # fronteira contra quem procura de propósito: pode haver outro builtin. Contra isso a
  # contenção é operacional (ver "Riscos" no script-engine.md).
  #
  # O complemento é o `--jitless` em config/initializers/mini_racer.rb, sem o qual nem o
  # limite de memória nem o de tempo valem em laço otimizado pelo TurboFan.
  module Sandbox
    # Sem JIT o V8 também não expõe WebAssembly, então isto denuncia o flag que faltou.
    # Conferido a cada execução: sem o flag, os limites não valem e o motor se recusa a rodar.
    JITLESS_CHECK_JS = "typeof WebAssembly === 'undefined'".freeze

    SOURCE = <<~'JS'.freeze
      (function (maxBinaryBytes, maxItems) {
        'use strict';

        const apply = Reflect.apply;
        const construct = Reflect.construct;
        const toText = String;
        const iterator = Symbol.iterator;
        const getter = (proto, name) => Object.getOwnPropertyDescriptor(proto, name).get;
        const define = (target, name, value) => {
          Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
        };

        // Lê o número uma vez só: quem conta e quem aloca precisam ver o mesmo valor, e um
        // `valueOf` que responde diferente na segunda leitura passaria pelo limite.
        const toSize = (value) => Math.max(Math.trunc(Number(value)) || 0, 0);

        // ── Coleções gigantes ───────────────────────────────────────────
        function refuseHuge(size) {
          if (Number(size) > maxItems) {
            throw new RangeError('Script exceeded the collection size limit');
          }
        }

        // Troca o método por um que confere o tamanho da entrada antes de chegar ao nativo.
        function guardMethods(target, names, sizeOf) {
          for (const name of names) {
            const native = target[name];
            if (typeof native !== 'function') continue;
            define(target, name, function (...args) {
              refuseHuge(sizeOf(this, args));
              return apply(native, this, args);
            });
          }
        }

        const lengthOf = (self) => (self === null || self === undefined ? 0 : self.length);
        const textLengthOf = (self) => (self === null || self === undefined ? 0 : toText(self).length);
        const firstArgumentLength = (self, args) => textLengthOf(args[0]);

        // Ficam de fora os que não varrem o array, para não pesar em `push` num laço.
        guardMethods(Array.prototype, [
          'concat', 'copyWithin', 'every', 'fill', 'filter', 'find', 'findIndex', 'findLast',
          'findLastIndex', 'flat', 'flatMap', 'forEach', 'includes', 'indexOf', 'join',
          'lastIndexOf', 'map', 'reduce', 'reduceRight', 'reverse', 'slice', 'some', 'sort',
          'splice', 'toLocaleString', 'toReversed', 'toSorted', 'toSpliced', 'toString', 'with'
        ], lengthOf);

        guardMethods(String.prototype, [
          'match', 'matchAll', 'normalize', 'replace', 'replaceAll', 'search', 'split',
          'toLowerCase', 'toUpperCase', 'toLocaleLowerCase', 'toLocaleUpperCase'
        ], textLengthOf);

        // O mesmo caminho, chamado direto: `/x/g[Symbol.match](s)`.
        guardMethods(RegExp.prototype, [
          Symbol.match, Symbol.matchAll, Symbol.replace, Symbol.search, Symbol.split
        ], firstArgumentLength);

        guardMethods(JSON, ['parse'], firstArgumentLength);

        // Array-like tem o `length` lido uma vez e os itens copiados em JS, onde o timeout
        // alcança: um getter responderia pequeno aqui e gigante para o nativo.
        const NativeArrayFrom = Array.from;
        function materialize(items) {
          if (items === null || typeof items !== 'object' || items[iterator] != null) return items;

          const size = toSize(items.length);
          refuseHuge(size);
          const copy = [];
          for (let i = 0; i < size; i++) copy.push(items[i]);
          return copy;
        }

        define(Array, 'from', function (items, ...rest) {
          return apply(NativeArrayFrom, this, [materialize(items), ...rest]);
        });

        // ── Memória binária ─────────────────────────────────────────────
        let binaryBytes = 0;
        function charge(bytes) {
          // Nunca desconta: `new Uint8Array(-1e12)` falha no nativo, e um valor negativo
          // aqui devolveria cota para o script.
          binaryBytes += Math.max(Number(bytes) || 0, 0);
          if (binaryBytes > maxBinaryBytes) {
            throw new RangeError('Script exceeded the binary memory limit');
          }
        }

        const NativeArrayBuffer = ArrayBuffer;
        const bufferBytes = getter(NativeArrayBuffer.prototype, 'byteLength');
        const isBuffer = (value) => {
          try { apply(bufferBytes, value, []); return true; } catch (e) { return false; }
        };

        function guardConstructor(name, Native, prepare) {
          const guarded = new Proxy(Native, {
            construct(target, args, newTarget) {
              return construct(target, prepare(args), newTarget);
            }
          });
          // A cota também vale para quem chega pelo `.constructor` de uma instância e para
          // os métodos que alocam pelo Symbol.species.
          Object.defineProperty(Native.prototype, 'constructor', {
            value: guarded, writable: false, configurable: false, enumerable: false
          });
          define(globalThis, name, guarded);
        }

        guardConstructor('ArrayBuffer', NativeArrayBuffer, (args) => {
          const size = toSize(args[0]);
          const options = args[1];
          const max = options === null || typeof options !== 'object' ? undefined : options.maxByteLength;
          if (max === undefined) {
            charge(size);
            return [size];
          }
          const maxBytes = toSize(max);
          charge(Math.max(size, maxBytes));
          return [size, { maxByteLength: maxBytes }];
        });

        const TypedArray = Object.getPrototypeOf(Uint8Array);
        const typedBytes = getter(TypedArray.prototype, 'byteLength');
        const typedLength = getter(TypedArray.prototype, 'length');
        const isTyped = (value) => {
          try { apply(typedLength, value, []); return true; } catch (e) { return false; }
        };

        const typedNames = [
          'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array',
          'Uint32Array', 'Float16Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array'
        ];
        for (const name of typedNames) {
          const Native = globalThis[name];
          if (typeof Native !== 'function') continue;

          guardConstructor(name, Native, (args) => {
            const first = args[0];
            if (first === null || typeof first !== 'object') {
              const size = toSize(first);
              charge(size * Native.BYTES_PER_ELEMENT);
              return [size];
            }
            if (isBuffer(first)) return args; // visão sobre memória que já existe
            if (isTyped(first)) {
              charge(apply(typedLength, first, []) * Native.BYTES_PER_ELEMENT);
              return args;
            }
            // Lista ou iterável: materializa antes de contar, pelo mesmo motivo do `toSize`.
            const list = apply(NativeArrayFrom, Array, [materialize(first)]);
            charge(list.length * Native.BYTES_PER_ELEMENT);
            return [list];
          });
        }

        // Estes alocam sem passar pelo construtor quando `x.constructor = undefined`, ou
        // sempre (`toSorted`, `toReversed`, `with`).
        for (const name of ['slice', 'map', 'filter', 'toReversed', 'toSorted', 'with']) {
          const native = TypedArray.prototype[name];
          if (typeof native !== 'function') continue;
          define(TypedArray.prototype, name, function (...args) {
            charge(apply(typedBytes, this, []));
            return apply(native, this, args);
          });
        }

        for (const name of ['slice', 'transfer', 'transferToFixedLength']) {
          const native = NativeArrayBuffer.prototype[name];
          if (typeof native !== 'function') continue;
          define(NativeArrayBuffer.prototype, name, function (...args) {
            const current = apply(bufferBytes, this, []);
            if (name === 'slice') {
              charge(current);
              return apply(native, this, args);
            }
            const size = args[0] === undefined ? current : toSize(args[0]);
            charge(size);
            return apply(native, this, [size]);
          });
        }

        // Memória compartilhada não tem uso numa thread só, e o `Atomics.wait` só bloquearia.
        delete globalThis.SharedArrayBuffer;
        delete globalThis.Atomics;
      })
    JS

    def self.source
      "#{SOURCE}(#{Limits::MAX_BINARY_BYTES}, #{Limits::MAX_COLLECTION_ITEMS});"
    end
  end
end
