/*jshint -W097 */
'use strict';

let header = `
// Type definitions for Tabris.js \${VERSION}

// TODO A plain string can be used as a shorthand, e.g. \`"image.jpg"\` equals \`{src: "image.jpg"}\`.
interface Image {

  /**
   * Image path or URL.
   */
  src?: string;

  /**
   * Image width, extracted from the image file when missing.
   */
  width?: number;

  /**
   * Image height, extracted from the image file when missing.
   */
  height?: number;

  /**
   * Image scale factor - the image will be scaled down by this factor.
   * Ignored when width or height are set.
   */
  scale?: number;
}

type Color = string;

type Font = string;

type LayoutData = any;

type GestureObject = any;

interface Bounds {

  /**
   * the horizontal offset from the parent's left edge in dip
   */
  left?: number;

  /**
   * the vertical offset from the parent's top edge in dip
   */
  top?: number;

  /**
   * the width of the widget in dip
   */
  width?: number;

  /**
   * the height of the widget in dip
   */
  height?: number;

}

interface Transformation {

  /**
   * Clock-wise rotation in radians. Defaults to \`0\`.
   */
   rotation?: number;

  /**
   * Horizontal scale factor. Defaults to \`1\`.
   */
  scaleX?: number;

  /**
   * Vertical scale factor. Defaults to \`1\`.
   */
  scaleY?: number;

  /**
   * Horizontal translation (shift) in dip. Defaults to \`0\`.
   */
  translationX?: number;

  /**
   * Vertical translation (shift) in dip. Defaults to \`0\`.
   */
  translationY?: number;

  /**
   * Z-axis translation (shift) in dip. Defaults to \`0\`. Android 5.0+ only.
   */
  translationZ?: number;

}

type Selector = string;

type dimension = number;

type offset = number;

type margin = any;
`.trim();

module.exports = function(grunt) {

  grunt.registerTask('generate-tsd', function() {
    let defs = readJsonDefs();
    let tsd = createTypeDefs(defs).replace(/\${VERSION}/g, grunt.config('version'));
    grunt.file.write('build/tabris/tabris.d.ts', tsd);
  });

  function readJsonDefs() {
    let defs = {};
    let doc = grunt.config('doc');
    let files = grunt.file.expand(doc.widgets).concat(grunt.file.expand(doc.api));
    files.forEach((file) => {
      let json = grunt.file.readJSON(file);
      json.file = file;
      defs[json.type || json.object] = json;
    });
    return defs;
  }

  function createTypeDefs(defs) {
    applyIncludes(defs, ['NativeObject']);
    let result = new Text();
    result.append(header);
    result.append('');
    Object.keys(defs).forEach((name) => {
      createTypeDef(result, defs[name], name);
    });
    result.append('');
    return result.toString();
  }

  function applyIncludes(defs, parents) {
    let newParents = [];
    Object.keys(defs).forEach((name) => {
      let def = defs[name];
      if (def.include) {
        // TODO adjust when json defs distiguish extends and includes
        let includes = def.include.filter(include => parents.indexOf(include) !== -1);
        if (includes.length > 0) {
          newParents.push(name);
        }
        includes.forEach(function(include) {
          let incl = defs[include];
          def.events = Object.assign({}, incl.events || {}, def.events);
        });
      }
    });
    if (newParents.length > 0) {
      applyIncludes(defs, newParents);
    }
  }

  function createTypeDef(result, def, name) {
    result.append('// ' + name);
    result.append('');
    addClass(result, def, name);
    result.append('');
    addPropertyInterface(result, def, name);
    addInstance(result, def, name);
    result.append('');
  }

  function addInstance(result, def, name) {
    if (def.object) {
      result.append('');
      result.append(`declare let ${def.object}: ${name};`);
    }
  }

  function addClass(result, def, name) {
    result.append(createDoc(def));
    result.append(createClassDef(name, def));
    result.indent++;
    addConstructor(result, name);
    addFields(result, def);
    addMethods(result, def);
    addEvents(result, def);
    addPropertyApi(result, def, name);
    addProperties(result, def);
    result.indent--;
    result.append('}');
  }

  function addConstructor(result, name) {
    result.append('');
    result.append(`constructor(properties?: ${name}Properties);`);
  }

  function createClassDef(name, def) {
    let str = 'export class ' + name;
    let superClass = getSuperClass(name, def);
    if (superClass) {
      str += ' extends ' + superClass;
    }
    return str + ' {';
  }

  function getSuperClass(name, def) {
    if (def.include) {
      // TODO adjust when json defs distiguish extends and includes
      let includes = def.include.filter(sup => sup !== 'NativeObject');
      if (includes.length > 1) {
        throw new Error('multiple inheritance: ' + name);
      }
      if (includes.length === 1) {
        return includes[0];
      }
    }
    return null;
  }

  function addPropertyInterface(result, def, name) {
    result.append(createPropertyInterfaceDef(name, def));
    result.indent++;
    Object.keys(def.properties || []).sort().forEach((name) => {
      result.append('');
      result.append(createInterfaceProperty(name, def.properties[name]));
    });
    result.indent--;
    result.append('}');
  }

  function createPropertyInterfaceDef(name, def) {
    let str = 'interface ' + name + 'Properties';
    if (def.include) {
      str += ' extends ' + def.include.map(sup => sup + 'Properties').join(', ');
    }
    return str + ' {';
  }

  function addFields(result, def) {
    if (def.fields) {
      Object.keys(def.fields).sort().forEach((name) => {
        result.append('');
        result.append(createField(name, def.fields[name]));
      });
    }
  }

  function addMethods(result, def) {
    if (def.methods) {
      Object.keys(def.methods).sort().forEach((name) => {
        if (!Array.isArray(def.methods[name])) {
          throw new Error('method definition not an array', def.type, name);
        }
        def.methods[name].forEach((method) => {
          result.append('');
          result.append(createMethod(name, method));
        });
      });
    }
  }

  function addEvents(result, def) {
    if (def.events) {
      addOffMethods(result, def);
      addOnMethods(result, def);
      addOnceMethods(result, def);
      addTriggerMethod(result);
    }
  }

  function addOffMethods(result, def) {
    result.append('');
    result.append(createComment([
      'Removes all occurrences of *listener* that are bound to *event* and *context* from this widget.',
      'If the context parameter is not present, all matching listeners will be removed.',
      'If the listener parameter is not present, all listeners that are bound to *event* will be removed.',
      'If the event parameter is not present, all listeners for all events will be removed from this widget.',
      'Supports chaining.',
      '@param event',
      '@param listener',
      '@param context'
    ]));
    result.append('off(event?: string, listener?: Function, context?: this): this;');
    Object.keys(def.events).sort().forEach((event) => {
      result.append(createOffMethod(event));
    });
  }

  function createOffMethod(name) {
    return `off(event: "${name}", listener?: Function, context?: this): this;`;
  }

  function addOnMethods(result, def) {
    result.append('');
    result.append(createComment([
      'Adds a *listener* to the list of functions to be notified when *event* is fired. If the context',
      'parameter is not present, the listener will be called in the context of this object. Supports',
      'chaining.',
      '@param event',
      '@param listener',
      '@param context? In the listener function, `this` will point to this object.'
    ]));
    result.append('on(event: string, listener: Function, context?: this): this;');
    Object.keys(def.events).sort().forEach((event) => {
      result.append(createOnMethod(event, def.events[event]));
    });
  }

  function createOnMethod(name, def) {
    return `on(event: "${name}", listener: (${createParamList(def.parameters)}) => any): this;`;
  }

  function addOnceMethods(result, def) {
    result.append('');
    result.append(createComment([
      'Same as `on`, but removes the listener after it has been invoked by an event. Supports chaining.',
      '@param event',
      '@param listener',
      '@param context? In the listener function, `this` will point to this object.'
    ]));
    result.append('once(event: string, listener: Function, context?: this): this;');
    Object.keys(def.events).sort().forEach((event) => {
      result.append(createOnceMethod(event, def.events[event]));
    });
  }

  function createOnceMethod(name, def) {
    return `once(event: "${name}", listener: (${createParamList(def.parameters)}, context?: this) => any): this;`;
  }

  function addTriggerMethod(result) {
    result.append('');
    result.append(createComment([
      'Triggers an event of the given type. All registered listeners will be notified. Additional parameters',
      'will be passed to the listeners.',
      '@param event',
      '@param ...params'
    ]));
    result.append('trigger(event: string, ...params: any[]): this;');
  }

  function addPropertyApi(result, def, name) {
    if (def.properties) {
      result.append('');
      result.append(createComment([
        'Gets the current value of the given *property*.',
        '@param property'
      ]));
      result.append('get(property: string): any;');
      result.append('');
      result.append(createComment([
        'Sets the given property. Supports chaining.',
        '@param property',
        '@param value'
      ]));
      result.append('set(property: string, value: any): this;');
      result.append('');
      result.append(createComment([
        'Sets all key-value pairs in the properties object as widget properties. Supports chaining.',
        '@param properties'
      ]));
      result.append(`set(properties: ${name}Properties): this;`);
    }
  }

  function addProperties(result, def) {
    Object.keys(def.properties || []).sort().forEach((name) => {
      result.append('');
      result.append(createProperty(name, def.properties[name]));
    });
  }

  function createProperty(name, def) {
    let result = [];
    result.push(createDoc(def));
    let values = [];
    (def.values || []).sort().forEach((value) => {
      values.push(`"${value}"`);
    });
    let valuesType = (values || []).join(' | ');
    result.push(`${name}: ${valuesType || def.type};`);
    return result.join('\n');
  }

  function createField(name, def) {
    let result = [];
    result.push(createDoc(def));
    result.push(`${name}: ${def.type};`);
    return result.join('\n');
  }

  function createInterfaceProperty(name, def) {
    let result = [];
    result.push(createDoc(def));
    let values = [];
    (def.values || []).sort().forEach((value) => {
      values.push(`"${value}"`);
    });
    let valuesType = (values || []).join(' | ');
    result.push(`${name}?: ${valuesType || def.type};`);
    return result.join('\n');
  }

  function createMethod(name, def) {
    let result = [];
    result.push(createDoc(def));
    result.push(`${name}(${createParamList(def.parameters)}): ${def.returns || 'void'};`);
    return result.join('\n');
  }

  function createParamList(parameters) {
    return parameters.map(param => `${param.name}: ${param.type}`).join(', ');
  }

  function createDoc(def) {
    if (!def.description && !def.static && !def.provisional) {
      return;
    }
    let result = [];
    if (def.description) {
      splitIntoLines(def.description, 100).forEach((line) => {
        result.push(line);
      });
    }
    if (def.parameters) {
      createParamAnnotations(def.parameters).forEach((line) => {
        result.push(line);
      });
    }
    if (def.static) {
      result.push('@static');
    }
    if (def.provisional) {
      result.push('@provisional');
    }
    return createComment(result);
  }

  function createComment(comment) {
    return ['/**'].concat(comment.map(line => ' * ' + line), ' */').join('\n');
  }
  function createParamAnnotations(params) {
    return params.map(param => `@param ${param.name} ${param.description || ''}`);
  }

  function splitIntoLines(text, maxlen) {
    if (typeof text !== 'string') {
      throw new Error('not a string: ' + text);
    }
    let linesIn = text.split('\n');
    let linesOut = [];
    for (let lineIn of linesIn) {
      let lineOut = '';
      let words = lineIn.split(' ');
      for (let word of words) {
        if (lineOut.length + word.length > maxlen) {
          linesOut.push(lineOut);
          lineOut = '';
        }
        if (lineOut.length > 0) {
          lineOut += ' ';
        }
        lineOut += word;
      }
      if (lineOut.length > 0) {
        linesOut.push(lineOut);
      }
    }
    return linesOut;
  }

  class Text {

    constructor() {
      this.lines = [];
      this.indent = 0;
    }

    append() {
      Array.prototype.forEach.call(arguments, (arg) => {
        let lines = typeof arg === 'string' ? arg.split('\n') : arg;
        for (let line of lines) {
          this.lines.push(this._indentLine(line));
        }
      }, this);
    }

    toString() {
      return this.lines.join('\n');
    }

    _indentLine(line) {
      return line.length > 0 ? '  '.repeat(this.indent) + line : line;
    }

  }

};

