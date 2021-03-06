const URITemplate = (function() {

'use strict';

/*
const UCSCHAR = new RegExp('[' + [
  /\u{00A0}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFEF}/,
  /\u{10000}-\u{1FFFD}\u{20000}-\u{2FFFD}\u{30000}-\u{3FFFD}/,
  /\u{40000}-\u{4FFFD}\u{50000}-\u{5FFFD}\u{60000}-\u{6FFFD}/,
  /\u{70000}-\u{7FFFD}\u{80000}-\u{8FFFD}\u{90000}-\u{9FFFD}/,
  /\u{A0000}-\u{AFFFD}\u{B0000}-\u{BFFFD}\u{C0000}-\u{CFFFD}/,
  /\u{D0000}-\u{DFFFD}\u{E1000}-\u{EFFFD}/
].map(x => x.source).join('') + ']', 'gu');
*/

const VAR_DELIM = ',';

const OP = /[+#]|[.\/;?&]/; // |[=,!@|]/;
const MODIFIER = /(?::([1-9][0-9]*))|([*])/;
const GEN_DELIMS = /[:/?#[\]@]/g;
const SUB_DELIMS = /[!$&'()*+,;=]/g;
const NON_DELIMS = /[ %]/g;
const RESERVED = new RegExp(`${GEN_DELIMS.source}|${SUB_DELIMS.source}`, 'g');
const VARCHAR = /(?:[A-Za-z0-9_]|(?:%[0-9A-F][0-9A-F]))+/;
const VARNAME = new RegExp(`${VARCHAR.source}(?:[.]${VARCHAR.source})*`);
const VARSPEC = new RegExp(`(${VARNAME.source})(${MODIFIER.source})?`);
const VARLIST = new RegExp(`${VARSPEC.source}(?:[${VAR_DELIM}]${VARSPEC.source})*`);
const EXPRESSION = new RegExp(`\{(${OP.source})?(${VARLIST.source})\}`, 'g');
const MSG = `Percent-encode braces ('{': ${encodeURIComponent('{')}, '}': ${encodeURIComponent('}')}) if this is not a template.`

const OP_OPTIONS = (function() {
  const escapeChar = c => '%' + c.charCodeAt(0).toString(16).toUpperCase();
  const escapeFn = pattern => str => encodeURIComponent(str).replace(pattern, escapeChar);
  const escapeFns = {
    i: str => (''+str),
    r: str => str.replace(NON_DELIMS, escapeChar),
    g: escapeFn(GEN_DELIMS),
    t: escapeFn(RESERVED),
    n: escapeFn(RESERVED)
  };

  const fromStr = str => ({
    separator: str[0] || ',',
    prefix: str[1] !== ' ' ? str[1] : '',
    escape: escapeFns[str[2]],
    names: (str[2] === 'n') || (str[2] === 't'),
    trim: (str[2] === 't')
  });

  return {
    'default': { prefix: '', separator: ',', escape: escapeFn(RESERVED), names: false, trim: false },
    '+': fromStr(', r'), // { prefix: '',  separator: ',', escape: true,  names: false, trim: false }
    '.': fromStr('..g'), // { prefix: '.', separator: '.', escape: true,  names: false, trim: false }
    '/': fromStr('//g'), // { prefix: '/', separator: '/', escape: true,  names: false, trim: false }
    '#': fromStr(',#r'), // { prefix: '#', separator: '',  escape: false, names: false, trim: false }
    ';': fromStr(';;t'), // { prefix: ';', separator: ';', escape: false, names: true,  trim: true }
    '?': fromStr('&?n'), // { prefix: '?', separator: '&', escape: false, names: true,  trim: false }
    '&': fromStr('&&n')  // { prefix: '&', separator: '&', escape: false, names: true,  trim: false }
  };
})();

function toRegExp(expression) {
  const {
    prefix,
    separator
  } = OP_OPTIONS[expression.op];

  const DELIMS = '/?&#';

  const exps = `(?:${expression.vars.map(v => {
    const base = `[^${DELIMS}]`;
    const count = v.prefix ? `{0,${v.prefix}}` : '*';
    const explode = v.explode ? `(?:[${separator}]${base}${count})*` : '';
    return `${base}${count}${explode}`;
  }).join('|')})`;

  return new RegExp(exps);
}

function toRegExp(literal) {
  const source = literal.replace(/([/\\().*+\[\]{}])/, '\\$1');
  return new RegExp(source);
}

function URITemplate(template) {
  const source = this.source = template;
  const parts = this.parts = [];
  const vars = this.vars = [];

  let offset = 0;
  let match;
  while ((match = EXPRESSION.exec(source))) {
    addLiteral(source.substr(offset, match.index - offset));
    addPart({
      source: match[0],
      op: match[1],
      vars: match[2].split(VAR_DELIM).map(v => {
        const match = VARSPEC.exec(v);
        const result = { name: match[1] };
        if (match[3]) {
          result.prefix = parseInt(match[3], 10);
        }
        if (match[4]) {
          result.explode = true;
        }
        return result;
      })
    });
    offset = match.index + match[0].length;
  }
  addLiteral(source.substr(offset));

  function addLiteral(source) {
    if (source === '') {
      return;
    }
    if (/[{}]/g.test(source)) {
      throw new Error(`Unparseable template in '${source}'.\n${MSG}`);
    }
    addPart({
      source,
      literal: true
    });
  }

  function addPart(part) {
    parts.push(part);
  }
}

URITemplate.prototype.match = function (uri) {
  let offset = 0;
  let part = 0;

  let match = {};

  return this.parts.every(part => {
    if (part.literal) {
      if (uri.substr(offset, part.source.length) !== part.source) {
        return false;
      }
      else {
        offset += part.length;
        return true;
      }
    }
    else {
    }
  }) && match;
};

URITemplate.prototype.render = function (vars) {
  const get = (typeof vars === 'function') ? vars : key => vars[key];

  return this.parts.map(part => {
    if (part.literal) {
      return part.source;
    }

    const {
      prefix,
      separator,
      escape,
      names,
      trim
    } = OP_OPTIONS[part.op || 'default'];

    const items = [];

    function pushVar(name, value) {
      items.push((name ? name + ((trim && (value === '')) ? '' : '=') : '') + value);
    }

    part.vars.forEach(v => {
      const name = names ? v.name : null;
      const value = get(v.name);

      if (value === undefined || value === null) {
         return;
      }

      if (Array.isArray(value)) {
        if (v.explode) {
          value.forEach(value => pushVar(name, escape(value)));
        }
        else if (value.length) {
          pushVar(name, value.map(escape).join(VAR_DELIM));
        }
      }
      else if (typeof value === 'object') {
        const names = Object.keys(value);
        if (v.explode) {
          names.forEach(name => pushVar(escape(name), escape(value[name])));
        }
        else if (names.length) {
          pushVar(name, names.map(name => `${escape(name)}${VAR_DELIM}${escape(value[name])}`).join(VAR_DELIM));
        }
      }
      else if (v.prefix) {
        pushVar(name, escape(value.substr(0, v.prefix)));
      }
      else {
        pushVar(name, escape(value));
      }
    });

    if (items.length === 0) {
      return '';
    }

    return prefix + items.join(separator);
  }).join('');
};

  return URITemplate;

})();

module.exports = {
  compile(template) {
    if (template instanceof URITemplate) {
      return template;
    }
    return new URITemplate(template);
  },
  match(template, uri) {
    return compile(template).match(uri);
  },
  render(template, vars) {
    return compile(template).render(vars);
  }
};
