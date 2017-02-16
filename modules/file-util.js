/**
 * file-util.js
 */
"use strict";
{
  /* api */
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const url = require("url");

  /* constants */
  const CHAR = "utf8";
  const IS_WIN = os.platform() === "win32";
  const MASK_BIT = 0o111;
  const PERM_FILE = 0o666;
  const PERM_DIR = 0o777;
  const SUBST = "index";
  const TMP_DIR = os.tmpdir();

  /**
   * is function
   * @param {*} o - object to check
   * @returns {boolean} - result
   */
  const isFunction = o => typeof o === "function";

  /**
   * is string
   * @param {*} o - object to check
   * @returns {boolean} - result
   */
  const isString = o => typeof o === "string" || o instanceof String;

  /**
   * stringify positive integer
   * @param {number} i - integer
   * @param {boolean} zero - treat 0 as a positive integer
   * @returns {?string} - stringified integer
   */
  const stringifyPositiveInt = (i, zero = false) =>
    Number.isSafeInteger(i) && (zero && i >= 0 || i > 0) && `${i}` || null;

  /**
   * get file name from native file path
   * @param {string} file - file path
   * @param {string} subst - substitute file name
   * @returns {string} - file name
   */
  const getFileNameFromFilePath = (file, subst = SUBST) => {
    const name = isString(file) &&
                   /^([^.]+)(?:\..+)?$/.exec(path.basename(file));
    return name && name[1] || subst;
  };

  /**
   * convert URI to native file path
   * @param {string} uri - URI
   * @returns {Object} - Promise.<?string> file path
   */
  const convUriToFilePath = uri => new Promise((resolve, reject) => {
    if (isString(uri)) {
      const {protocol, pathname} = url.parse(uri, false, true);
      let file;
      if (protocol === "file:" && pathname) {
        if (IS_WIN) {
          const arr = pathname.split("/");
          file = arr.reduce((p, c) =>
            p && path.join(p, decodeURIComponent(c)) || decodeURIComponent(c)
          );
        } else {
          file = decodeURIComponent(pathname);
        }
      }
      resolve(file || null);
    } else {
      reject(new TypeError(`Expected string but got ${typeof uri}.`));
    }
  });

  /**
   * the file is a file
   * @param {string} file - file path
   * @returns {boolean} - result
   */
  const isFile = file =>
    isString(file) && fs.existsSync(file) && fs.statSync(file).isFile();

  /**
   * the file is executable
   * @param {string} file - file path
   * @param {number} mask - mask bit
   * @returns {boolean} - result
   */
  // FIXME: On Windows, `fs.statSync(file).mode` returns 33206, which is 100666
  // in octal, for executable files like `.exe`.
  // Currently, only `.exe` file returns `true` on Windows.
  const isExecutable = (file, mask = MASK_BIT) =>
    isFile(file) && (
      !!(fs.statSync(file).mode & mask) || IS_WIN && /\.exe$/.test(file)
    );

  /**
   * the directory is a directory
   * @param {string} dir - directory path
   * @returns {boolean} - result
   */
  const isDir = dir =>
    isString(dir) && fs.existsSync(dir) && fs.statSync(dir).isDirectory();

  /**
   * the directory is a subdirectory of a certain directory
   * @param {string} dir - directory path
   * @param {string} baseDir - base directory path
   * @returns {boolean} - result
   */
  const isSubDir = (dir, baseDir = TMP_DIR) =>
    isDir(dir) && isDir(baseDir) && dir.startsWith(baseDir);

  /**
   * remove the directory
   * @param {string} dir - directory path
   * @param {string} baseDir - base directory path
   * @returns {Object} - Promise.<Array.<*>>
   */
  const removeDir = (dir, baseDir = TMP_DIR) =>
    new Promise((resolve, reject) => {
      if (isSubDir(dir, baseDir)) {
        const files = fs.readdirSync(dir);
        const func = [];
        files.length && files.forEach(file => {
          const cur = path.join(dir, file);
          if (fs.lstatSync(cur).isDirectory()) {
            func.push(removeDir(cur, baseDir));
          } else {
            func.push(fs.unlinkSync(cur));
          }
        });
        resolve(Promise.all(func).then(() => fs.rmdirSync(dir)));
      } else {
        reject(new Error(`${dir} is not a subdirectory of ${baseDir}.`));
      }
    });

  /**
   * remove the directory sync
   * @param {string} dir - directory path
   * @param {string} baseDir - base directory path
   * @returns {void}
   */
  const removeDirSync = (dir, baseDir = TMP_DIR) => {
    if (isSubDir(dir, baseDir)) {
      const files = fs.readdirSync(dir);
      files.length && files.forEach(file => {
        const cur = path.join(dir, file);
        if (fs.lstatSync(cur).isDirectory()) {
          removeDirSync(cur, baseDir);
        } else {
          fs.unlinkSync(cur);
        }
      });
      fs.rmdirSync(dir);
    }
  };

  /**
   * create a directory
   * @param {Array} arr - directory array
   * @param {string|number} mode - permission
   * @returns {Object} - Promise.<?string>, directory path
   */
  const createDir = (arr, mode = PERM_DIR) => new Promise((resolve, reject) => {
    if (Array.isArray(arr)) {
      const dir = arr.length && arr.reduce((p, c) => {
        let d;
        p = isString(p) && p || stringifyPositiveInt(p, true);
        if (p) {
          const v = isString(c) && c || stringifyPositiveInt(c, true);
          d = v && path.join(p, v) || p;
          !fs.existsSync(d) && fs.mkdirSync(d, mode);
        }
        return d;
      });
      resolve(dir || null);
    } else {
      reject(new TypeError(`Expected array but got ${typeof arr}.`));
    }
  });

  /**
   * create a file
   * @param {string} file - file path
   * @param {string} value - value to write
   * @param {Object} opt - option
   * @param {string} [opt.encoding] - file encoding
   * @param {string} [opt.flag] - flag
   * @param {number|string} opt.mode - file permission
   * @returns {Object} - Promise.<?string> file path
   */
  const createFile = (file, value = "",
                      opt = {encoding: CHAR, flag: "w", mode: PERM_FILE}) =>
    new Promise((resolve, reject) => {
      if (isString(file)) {
        resolve(fs.writeFileSync(file, value, opt));
      } else {
        reject(new TypeError(`Expected string but got ${typeof file}.`));
      }
    }).then(() => isFile(file) && file || null);

  /**
   * create a file then returns callback
   * @param {string} file - file path
   * @param {string} value - value to write
   * @param {Function} callback - callback when write completes
   * @param {Object} cbOpt - callback option
   * @param {Object} opt - option
   * @param {string} [opt.encoding] - file encoding
   * @param {string} [opt.flag] - flag
   * @param {number|string} [opt.mode] - file permission
   * @returns {Object} - Promise.<?Function>
   */
  const createFileWithCallback = (
    file, value = "", callback = null, cbOpt = null,
    opt = {encoding: CHAR, flag: "w", mode: PERM_FILE}
  ) =>
    new Promise((resolve, reject) => {
      if (isString(file)) {
        resolve(fs.writeFileSync(file, value, opt));
      } else {
        reject(new TypeError(`Expected string but got ${typeof file}.`));
      }
    }).then(() =>
      isFile(file) && isFunction(callback) && callback(file, cbOpt) || null
    );

  /**
   * read a file
   * @param {string} file - file path
   * @param {Object} opt - option
   * @param {string} [opt.encoding] - file encoding
   * @param {string} [opt.flag] - flag
   * @returns {Object} - Promise.<string> file content
   */
  const readFile = (file, opt = {encoding: CHAR, flag: "r"}) =>
    new Promise((resolve, reject) => {
      if (isFile(file)) {
        const value = fs.readFileSync(file, opt);
        resolve(value);
      } else {
        reject(new Error(`${file} is not a file.`));
      }
    });

  /**
   * read a file and returns callback
   * @param {string} file - file path
   * @param {Function} callback - callback when read completes
   * @param {Object} cbOpt - callback option
   * @param {Object} opt - option
   * @param {string} [opt.encoding] - file encoding
   * @param {string} [opt.flag] - flag
   * @returns {Object} - Promise.<Function|string>
   */
  const readFileWithCallback = (file, callback = null, cbOpt = null,
                                opt = {encoding: CHAR, flag: "r"}) =>
    new Promise((resolve, reject) => {
      if (isFile(file)) {
        const value = fs.readFileSync(file, opt);
        resolve(isFunction(callback) && callback(value, cbOpt) || value);
      } else {
        reject(new Error(`${file} is not a file.`));
      }
    });

  /**
   * get file timestamp
   * @param {string} file - file path
   * @returns {number} - timestamp
   */
  const getFileTimestamp = file =>
    isString(file) && fs.existsSync(file) &&
    fs.statSync(file).mtime.getTime() || 0;

  module.exports = {
    convUriToFilePath, createDir, createFile, createFileWithCallback,
    getFileNameFromFilePath, getFileTimestamp, isDir, isExecutable, isFile,
    isSubDir, removeDir, removeDirSync, readFile, readFileWithCallback,
  };
}
