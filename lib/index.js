import proj4 from 'proj4';
import binaryAjax from './binaryajax.js';
import parseShp from './parseShp.js';
import parseDbf from 'parsedbf';
import JSZip from 'jszip'; // Importando JSZip para tratar arquivos .zip
import { TextDecoder, TextEncoder } from 'text-encoding'; // Polyfill para TextDecoder

const txtDecoder = new TextDecoder();
const toString = (possibleString) => {
  if (!possibleString) {
    return;
  }
  if (typeof possibleString === 'string') {
    return possibleString;
  }
  if (isArrayBuffer(possibleString) || ArrayBuffer.isView(possibleString) || isDataView(possibleString)) {
    return txtDecoder.decode(possibleString);  // Use polyfill
  }
};

const toUitn8Arr = (b) => {
  if (!b) {
    throw new Error('forgot to pass buffer');
  }
  if (isArrayBuffer(b)) {
    return new Uint8Array(b);
  }
  if (isArrayBuffer(b.buffer)) {
    if (b.BYTES_PER_ELEMENT === 1) {
      return b;
    }
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  throw new Error('invalid buffer like object');
};

const toDataView = (b) => {
  if (!b) {
    throw new Error('forgot to pass buffer');
  }
  if (isDataView(b)) {
    return b;
  }
  if (isArrayBuffer(b)) {
    return new DataView(b);
  }
  if (isArrayBuffer(b.buffer)) {
    return new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  throw new Error('invalid buffer like object');
};

function isArrayBuffer(subject) {
  return subject instanceof globalThis.ArrayBuffer || Object.prototype.toString.call(subject) === '[object ArrayBuffer]';
}
function isDataView(subject) {
  return subject instanceof globalThis.DataView || Object.prototype.toString.call(subject) === '[object DataView]';
}

export const combine = function ([shp, dbf]) {
  const out = {};
  out.type = 'FeatureCollection';
  out.features = [];
  let i = 0;
  const len = shp.length;
  if (!dbf) {
    dbf = [];
  }
  while (i < len) {
    out.features.push({
      type: 'Feature',
      geometry: shp[i],
      properties: dbf[i] || {},
    });
    i++;
  }
  return out;
};

async function getZip(base, whiteList) {
  // Função para processar o arquivo .zip
  const zip = new JSZip();
  const unzipped = await zip.loadAsync(base); // Carrega o conteúdo do .zip
  const shpFile = await unzipped.file(/\.shp$/i)[0].async('arraybuffer'); // Obtém o arquivo .shp
  const dbfFile = await unzipped.file(/\.dbf$/i)[0].async('arraybuffer'); // Obtém o arquivo .dbf
  const prjFile = await unzipped.file(/\.prj$/i)?.async('string'); // Obtém o arquivo .prj se existir

  return combine([parseShp(toDataView(shpFile), prjFile ? proj4(prjFile) : null), parseDbf(toDataView(dbfFile))]);
}

const handleShp = async (base) => {
  const args = await Promise.all([binaryAjax(base, 'shp'), binaryAjax(base, 'prj')]);
  let prj = false;
  try {
    if (args[1]) {
      prj = proj4(args[1]);
    }
  } catch (e) {
    prj = false;
  }
  return parseShp(args[0], prj);
};

const handleDbf = async (base) => {
  const [dbf, cpg] = await Promise.all([binaryAjax(base, 'dbf'), binaryAjax(base, 'cpg')]);
  if (!dbf) {
    return;
  }
  return parseDbf(dbf, cpg);
};

const checkSuffix = (base, suffix) => {
  const url = new URL(base, globalThis?.document?.location);
  return url.pathname.slice(-4).toLowerCase() === suffix;
};

const fromObject = ({ shp, dbf, cpg, prj }) => {
  const things = [_parseShp(shp, prj)];
  if (dbf) {
    things.push(_parseDbf(dbf, cpg));
  }
  return combine(things);
};

export const getShapefile = async function (base, whiteList) {
  if (typeof base !== 'string') {
    if (isArrayBuffer(base) || ArrayBuffer.isView(base) || isDataView(base)) {
      return getZip(base); // Processa o arquivo .zip
    }
    if (base.shp) {
      return fromObject(base);
    }
    throw new TypeError('must be a string, some sort of Buffer, or an object with at least a .shp property');
  }
  if (checkSuffix(base, '.shp')) {
    base = base.slice(0, -4);
  }
  const results = await Promise.all([handleShp(base), handleDbf(base)]);
  return combine(results);
};

const _parseShp = function (shp, prj) {
  shp = toDataView(shp);
  prj = toString(prj);
  if (typeof prj === 'string') {
    try {
      prj = proj4(prj);
    } catch (e) {
      prj = false;
    }
  }
  return parseShp(shp, prj);
};

const _parseDbf = function (dbf, cpg) {
  dbf = toDataView(dbf);
  cpg = toString(cpg);
  return parseDbf(dbf, cpg);
};

export default getShapefile;
export { _parseDbf as parseDbf, _parseShp as parseShp };
