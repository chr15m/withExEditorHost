/**
 * index.js
 */
"use strict";
{
  /* api */
  const {Input, Output} = require("./modules/native-message");
  const {concatArgs, isString, throwErr} = require("./modules/common");
  const {
    convUriToFilePath, createDir, createFile, getFileNameFromFilePath,
    getFileTimestamp, isDir, isExecutable, isFile, removeDir, readFile,
  } = require("./modules/file-util");
  const {execFile} = require("child_process");
  const os = require("os");
  const path = require("path");
  const process = require("process");

  /* constants */
  const {
    EDITOR_CONFIG_GET, EDITOR_CONFIG_RES, HOST, LABEL, LOCAL_FILE_VIEW,
    PROCESS_CHILD, TMP_FILES, TMP_FILES_PB, TMP_FILES_PB_REMOVE,
    TMP_FILE_CREATE, TMP_FILE_DATA_PORT, TMP_FILE_GET, TMP_FILE_RES,
  } = require("./modules/constant");
  const APP = `${process.pid}`;
  const CHAR = "utf8";
  const CMD_ARGS = "cmdArgs";
  const DIR_TMP = [os.tmpdir(), LABEL, APP];
  const DIR_TMP_FILES = [...DIR_TMP, TMP_FILES];
  const DIR_TMP_FILES_PB = [...DIR_TMP, TMP_FILES_PB];
  const EDITOR_PATH = "editorPath";
  const FILE_AFTER_ARGS = "fileAfterCmdArgs";

  /* variables */
  const vars = {
    [CMD_ARGS]: [],
    [EDITOR_PATH]: "",
    [FILE_AFTER_ARGS]: false,
  };

  /**
   * host message
   * @param {*} message - message
   * @param {string} status - status
   * @returns {Object} - host message object
   */
  const hostMsg = (message, status) => ({
    [HOST]: {
      message, status,
      pid: APP,
    },
  });

  /**
   * handle rejection
   * @param {*} e - Error or any
   * @returns {boolean} - false
   */
  const handleReject = e => {
    e = (new Output()).encode(hostMsg(e, "error"));
    e && process.stdout.write(e);
    return false;
  };

  /* output */
  /**
   * write stdout
   * @param {*} msg - message
   * @returns {Object} - Promise.<?Function>
   */
  const writeStdout = async msg => {
    msg = await (new Output()).encode(msg);
    return msg && process.stdout.write(msg) || null;
  };

  /**
   * port app status
   * @param {Array} arr - array of temporary directories
   * @returns {Object} - Promise.<Array>
   */
  const portAppStatus = async (arr = []) => {
    const [tmpDir, tmpDirPb] = arr;
    const func = [];
    if (tmpDir && tmpDirPb) {
      func.push(writeStdout(hostMsg(EDITOR_CONFIG_GET, "ready")));
    } else {
      !tmpDir && func.push(writeStdout(
        hostMsg(`Failed to create ${path.join(DIR_TMP_FILES)}.`, "warn")
      ));
      !tmpDirPb && func.push(writeStdout(
        hostMsg(`Failed to create ${path.join(DIR_TMP_FILES_PB)}.`, "warn")
      ));
    }
    return Promise.all(func);
  };

  /**
   * port editor config
   * @param {string} data - editor config
   * @param {string} editorConfig - editor config file path
   * @returns {Object} - Promise.<?AsyncFunction>
   */
  const portEditorConfig = async (data, editorConfig) => {
    let msg;
    try {
      data = data && JSON.parse(data);
      if (data) {
        const {editorPath} = data;
        const editorName = await getFileNameFromFilePath(editorPath);
        const executable = await isExecutable(editorPath);
        const items = Object.keys(data);
        if (items.length) {
          for (const item of items) {
            vars[item] = data[item];
          }
        }
        msg = {
          [EDITOR_CONFIG_RES]: {
            editorConfig, editorName, editorPath, executable,
          },
        };
      }
    } catch (e) {
      msg = hostMsg(`${e}: ${editorConfig}`, "error");
    }
    return msg && writeStdout(msg) || null;
  };

  /**
   * port file data
   * @param {Object} obj - file data
   * @returns {Object} - Promise.<?AsyncFunction>
   */
  const portFileData = async (obj = {}) => {
    const {data, filePath} = obj;
    let msg;
    if (data && await isString(filePath)) {
      data.filePath = filePath;
      msg = {
        [TMP_FILE_DATA_PORT]: {data, filePath},
      };
    }
    return msg && writeStdout(msg) || null;
  };

  /**
   * port temporary file
   * @param {Object} obj - temporary file data object
   * @returns {Object} - Promise.<?AsyncFunction>
   */
  const portTmpFile = async (obj = {}) => {
    const msg = Object.keys(obj).length && {
      [TMP_FILE_RES]: obj,
    };
    return msg && writeStdout(msg) || null;
  };

  /* child process */
  /**
   * spawn child process
   * @param {string} file - file path
   * @param {string} app - app path
   * @returns {Object} - Promise.<ChildProcess>
   */
  const spawnChildProcess = async (file, app = vars[EDITOR_PATH]) => {
    if (await !isFile(file)) {
      return writeStdout(hostMsg(`${file} is not a file.`, "warn"));
    }
    if (await !isExecutable(app)) {
      return writeStdout(hostMsg(`${app} is not executable.`, "warn"));
    }
    let args = vars[CMD_ARGS] || [];
    const pos = vars[FILE_AFTER_ARGS] || false;
    const argA = pos && args || [file.replace(/\\/g, "\\\\")];
    const argB = pos && [file.replace(/\\/g, "\\\\")] || args;
    const opt = {
      cwd: null,
      encoding: CHAR,
      env: process.env,
    };
    args = await concatArgs(argA, argB);
    return execFile(app, args, opt, (e, stdout, stderr) => {
      if (e) {
        e = (new Output()).encode(e);
        e && process.stderr.write(e);
      }
      if (stderr) {
        stderr = (new Output()).encode(
          hostMsg(`${stderr}: ${app}`, `${PROCESS_CHILD}_stderr`)
        );
        stderr && process.stdout.write(stderr);
      }
      if (stdout) {
        stdout = (new Output()).encode(
          hostMsg(`${stdout}: ${app}`, `${PROCESS_CHILD}_stdout`)
        );
        stdout && process.stdout.write(stdout);
      }
    });
  };

  /* temporary files */
  /**
   * initialize private temporary directory
   * @param {boolean} bool - remove
   * @returns {Object} - Promise.<?AsyncFunction>
   */
  const initPrivateTmpDir = async bool => {
    let msg;
    if (bool) {
      const dir = path.join(...DIR_TMP_FILES_PB);
      await removeDir(dir);
      if (await isDir(dir)) {
        msg = hostMsg(`Failed to remove ${dir}.`, "warn");
      } else {
        const dPath = await createDir(DIR_TMP_FILES_PB);
        dir !== dPath && (msg = hostMsg(`Failed to create ${dir}.`, "warn"));
      }
    }
    return msg && writeStdout(msg) || null;
  };

  /**
   * create temporary file
   * @param {Object} obj - temporary file data object
   * @returns {Object} - Promise.<Object>, temporary file data
   */
  const createTmpFile = async (obj = {}) => {
    const {data, value} = obj;
    let filePath;
    if (data) {
      const {dir, fileName, host, tabId, windowId} = data;
      const arr = dir && windowId && tabId && host &&
                    [...DIR_TMP, dir, windowId, tabId, host];
      const dPath = arr && await createDir(arr);
      filePath = dPath === path.join(...arr) && fileName &&
                   await createFile(path.join(dPath, fileName), value);
    }
    return data && filePath && {data, filePath} || null;
  };

  /**
   * get temporary file
   * @param {Object} data - temporary file data
   * @returns {Object} - Promise.<Object>, temporary file data object
   */
  const getTmpFile = async (data = {}) => {
    const {filePath} = data;
    let value = "";
    if (filePath) {
      data.timestamp = await getFileTimestamp(filePath) || 0;
      value = await readFile(filePath);
    }
    return {data, value};
  };

  /* local files */
  /**
   * get editor config
   * @param {string} filePath - editor config file path
   * @returns {Object} - Promise.<Array>
   */
  const getEditorConfig = async filePath => {
    const func = [];
    filePath = await isString(filePath) && filePath.length && filePath ||
               path.resolve(path.join(".", "editorconfig.json"));
    if (await isFile(filePath)) {
      const data = await readFile(filePath);
      func.push(portEditorConfig(data, filePath));
    } else {
      func.push(writeStdout(hostMsg(`${filePath} is not a file.`, "warn")));
      func.push(writeStdout({[EDITOR_CONFIG_RES]: null}));
    }
    return Promise.all(func);
  };

  /**
   * view local file
   * @param {string} uri - local file uri
   * @returns {Object} - Promise.<?AsyncFunction>
   */
  const viewLocalFile = async uri => {
    const file = await convUriToFilePath(uri);
    return file && spawnChildProcess(file) || null;
  };

  /* handlers */
  /**
   * handle created temporary file
   * @param {Object} obj - temporary file data
   * @returns {Object} - Promise.<Array>
   */
  const handleCreatedTmpFile = async (obj = {}) => {
    const {filePath} = obj;
    const func = [];
    if (filePath) {
      func.push(spawnChildProcess(filePath));
      func.push(portFileData(obj));
    }
    return Promise.all(func);
  };

  /**
   * handle message
   * @param {*} msg - message
   * @returns {Object} - Promise.<Array>
   */
  const handleMsg = async msg => {
    const func = [];
    const items = msg && Object.keys(msg);
    if (items && items.length) {
      for (const item of items) {
        const obj = msg[item];
        switch (item) {
          case EDITOR_CONFIG_GET:
            func.push(getEditorConfig(obj));
            break;
          case LOCAL_FILE_VIEW:
            func.push(viewLocalFile(obj));
            break;
          case TMP_FILE_CREATE:
            func.push(createTmpFile(obj).then(handleCreatedTmpFile));
            break;
          case TMP_FILE_GET:
            func.push(getTmpFile(obj).then(portTmpFile));
            break;
          case TMP_FILES_PB_REMOVE:
            func.push(initPrivateTmpDir(obj));
            break;
          default:
            func.push(
              writeStdout(hostMsg(`No handler found for ${item}.`, "warn"))
            );
        }
      }
    } else {
      func.push(writeStdout(hostMsg(`No handler found for ${msg}.`, "warn")));
    }
    return Promise.all(func);
  };

  /* input */
  const input = new Input();

  /**
   * read stdin
   * @param {string|Buffer} chunk - chunk
   * @returns {Object} - ?Promise.<Array>
   */
  const readStdin = chunk => {
    const arr = input.decode(chunk);
    const func = [];
    Array.isArray(arr) && arr.length && arr.forEach(msg => {
      msg && func.push(handleMsg(msg));
    });
    return func.length && Promise.all(func).catch(handleReject) || null;
  };

  /* exit */
  /**
   * handle exit
   * @param {number} code - exit code
   * @returns {void}
   */
  const handleExit = code => {
    const msg = (new Output()).encode(hostMsg(`exit ${code || 0}`, "exit"));
    removeDir(path.join(...DIR_TMP));
    msg && process.stdout.write(msg);
  };

  /* process */
  process.on("exit", handleExit);
  process.on("uncaughtException", throwErr);
  process.on("unhandleRejection", handleReject);
  process.stdin.on("data", readStdin);

  /* startup */
  Promise.all([
    createDir(DIR_TMP_FILES),
    createDir(DIR_TMP_FILES_PB),
  ]).then(portAppStatus).catch(handleReject);
}
