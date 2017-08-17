// Generate, format, test and print the TABLE constant used by bindings:

var assert = require('assert');
var crypto = require('crypto');

function format(table) {
  function pad(string, width) {
    while (string.length < width) string = string + ' ';
    return string;
  }
  var max = 0;
  for (var index = 0, length = table.length; index < length; index++) {
    var integer = table[index];
    if (integer > max) max = integer;
  }
  var width = max.toString().length + 2;
  var string = '  ';
  var column = 0;
  for (var index = 0, length = table.length; index < length; index++) {
    var integer = table[index];
    var eof = index === length - 1;
    string += pad(
      String(integer + (eof ? '' : ',')),
      column < 5 && !eof ? width : 0
    );
    column++;
    if (column === 6) {
      column = 0;
      string += '\n  ';
    }
  }
  return string;
}

function generate() {
  // 31-bit integers are faster than 32-bit integers in Javascript (since there
  // is no need for unboxing) and immune from signed 32-bit integer overflow.
  var range = Math.pow(2, 31);
  var table = new Uint32Array(256);
  var key = Buffer.alloc(32);
  var iv = Buffer.alloc(16);
  var cipher = crypto.createCipheriv('AES-256-CTR', key, iv);
  var buffer = cipher.update(Buffer.alloc(table.length * 4));
  cipher.final();
  for (var index = 0; index < table.length; index++) {
    var integer = buffer.readUInt32BE(index * 4) % range;
    if (integer >= 0 && integer < range) {
      table[index] = integer;
    } else {
      throw new Error('unexpected integer: ' + integer);
    }
  }
  return table;
}

function isInt(value) {
  if (typeof value !== 'number') return 'not a number: ' + value;
  if (Math.floor(value) !== value) return 'not an integer: ' + value;
  if (value < 0) return 'not a positive integer: ' + value;
  return value;
}

function test(a, b) {
  assert(a.length === 256, 'tableA.length');
  assert(b.length === 256, 'tableB.length');
  var range = Math.pow(2, 31);
  for (var index = 0; index < 256; index++) {
    var x = a[index];
    var y = b[index];
    assert(isInt(x) === y, 'table[' + index + '] integer deterministic');
    assert(x >= 0 && x < range, 'table[' + index + '] within range');
  }
}

var table1 = generate();
var table2 = generate();
var table3 = JSON.parse(
  '[' + format(table2).replace(/,\s+/g, ', ').trim() + ']'
);
test(table1, table3);

console.log('var TABLE = new Uint32Array([\n' + format(table1) + '\n]);');
