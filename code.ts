type MessageTest = {
  type: "test";
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
};

type MessageImport = {
  type: "import-to-figma";
  token: string;
  owner: string;
  repo: string;
  path: string;
};

type MessageExport = {
  type: "export-to-github";
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  branchName: string; // TODO: for creating PR
};

type Message = MessageTest | MessageImport | MessageExport;

console.clear();

// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, {
  width: 400,
  height: 200,
});

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
figma.ui.onmessage = async (msg: Message) => {
  // One way of distinguishing between different types of messages sent from
  // your HTML page is to use an object with a "type" property like this.

  console.log("onmessage", msg);

  switch (msg.type) {
    case "test":
      // createPullRequest(msg.token, msg.owner, msg.repo, msg.branch);

      testPushToBranch(msg.token, msg.owner, msg.repo, msg.branch, msg.path);

      // testGetPrs(msg.token, msg.owner, msg.repo);
      break;

    case "import-to-figma":
      {
        const designTokens = await fetchDesignTokensFromRepo(
          msg.token,
          msg.owner,
          msg.repo,
          msg.path
        );

        await applyDesignTokensToFigma(designTokens);

        figma.ui.postMessage({
          type: "import-to-figma",
        });
      }
      break;

    case "export-to-github":
      {
        const variables = await getVariablesFromFigma();

        const designTokens = convertToDesignTokens(variables);

        await exportDesignTokensToGithub(
          msg.token,
          msg.owner,
          msg.repo,
          msg.path,
          designTokens
        );

        figma.ui.postMessage({
          type: "export-to-github",
        });
      }
      break;

    default:
      console.error("Unknown message type:", msg);
      break;
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  // figma.closePlugin();
};

async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  branchName: string
) {
  figma.ui.postMessage({ type: "log", message: "creating Pull Request" });

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  const createPr = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Figma: Update design token",
        body: "Automated via Figma Plugin",
        head: branchName,
        base: "main",
      }),
    }
  );

  const body = await createPr.json();

  if (!createPr.ok) {
    figma.ui.postMessage({
      type: "log",
      message: "Failed to create PR. Is it already created?",
    });

    return;
  }

  figma.ui.postMessage({
    type: "log",
    message: `Created PR for branch: ${branchName}`,
  });

  // Attach label

  const issueNumber = body.number;
  const labels = ["Type: Design Token"];

  const updatePr = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        labels,
      }),
    }
  );

  if (!updatePr.ok) {
    const json = await updatePr.json();
    console.log(json);
    return;
  }

  figma.ui.postMessage({
    type: "log",
    message: `Added label: ${labels}`,
  });
}

async function getLatestMainBranchSha(
  token: string,
  owner: string,
  repo: string
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  figma.ui.postMessage({ type: "log", message: "getting main SHA" });

  const mainRef = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`,
    { headers }
  );
  const mainData = await mainRef.json();
  const mainSHA = mainData.object.sha;

  return mainSHA;
}

async function isBranchExist(
  token: string,
  owner: string,
  repo: string,
  branchName: string
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  figma.ui.postMessage({ type: "log", message: "checking existing branch" });

  const existingBranch = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${branchName}`,
    {
      method: "GET",
      headers,
    }
  );

  return existingBranch.status === 200;
}

async function getDesignTokenFile(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  designTokenPath: string
) {
  console.log("###", branchName, designTokenPath);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  figma.ui.postMessage({ type: "log", message: "checking existing file" });

  const existingFile = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${designTokenPath}?ref=${branchName}`,
    {
      method: "GET",
      headers,
      cache: "no-cache",
    }
  );

  return existingFile;
}

async function testPushToBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  designTokenPath: string
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  // ==================================================

  const mainSHA = await getLatestMainBranchSha(token, owner, repo);

  // ==================================================

  const branchExists = await isBranchExist(token, owner, repo, branchName);

  if (!branchExists) {
    figma.ui.postMessage({
      type: "log",
      message: `creating new branch: ${branchName}`,
    });

    const createBranch = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: mainSHA,
        }),
      }
    );

    if (!createBranch.ok) {
      throw new Error(`Failed to create branch: ${await createBranch.text()}`);
    }
  }

  // ==================================================

  const existingFile = await getDesignTokenFile(
    token,
    owner,
    repo,
    branchName,
    designTokenPath
  );

  // Note: We only want to update existing Design Tokens.
  // If we want to create new design tokens, do it in a separate action.
  if (existingFile.status === 200) {
    figma.ui.postMessage({ type: "log", message: `committing file update` });
    const json = await existingFile.json();

    const createFile = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${designTokenPath}`,
      {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          message: "Design token update",
          content: encode({ foo: "update" }),
          branch: branchName,
          sha: json.sha,
        }),
      }
    );

    if (!createFile.ok) {
      const json = await createFile.json();
      console.log(json);
      throw new Error(`Failed to create file: ${await createFile.text()}`);
    }
  }
}

async function _testGetPrs(token: string, owner: string, repo: string) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: undefined,
    }
  );

  const data = await res.json();

  if (res.status !== 200) {
    throw { res, data };
  }

  console.log(data);
}

async function fetchDesignTokensFromRepo(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<Record<string, string>> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: undefined,
    }
  );

  const data = await res.json();

  if (res.status !== 200) {
    throw { res, data };
  }

  if (data.encoding !== "base64") {
    throw {
      message: "Unexpected data",
      res,
      data,
    };
  }

  const base64 = (data.content as string).replace(/\n/g, "");
  const decodedBase64 = figma.base64Decode(base64);
  const jsonString = Array.from(decodedBase64)
    .map((byte) => String.fromCharCode(byte))
    .join("");
  const result = JSON.parse(jsonString);

  return result;
}

async function applyDesignTokensToFigma(
  _designTokens: Record<string, string>
): Promise<void> {
  throw "unimplemented";
}

async function getVariablesFromFigma(): Promise<Record<string, string>> {
  // Flow: Get data from github repo's JSON file

  const localCollections =
    await figma.variables.getLocalVariableCollectionsAsync();

  console.log("collections", localCollections);

  const collection = await figma.variables.getVariableCollectionByIdAsync(
    localCollections[0].id
  );

  console.log("collection", collection);

  const vars1 = await figma.variables.getLocalVariablesAsync("BOOLEAN");
  const vars2 = await figma.variables.getLocalVariablesAsync("COLOR");
  const vars3 = await figma.variables.getLocalVariablesAsync("FLOAT");
  const vars4 = await figma.variables.getLocalVariablesAsync("STRING");

  console.log(
    "vars1",
    vars1.map((i) => i.name)
  );
  console.log(
    "vars2",
    vars2.map((i) => i.name)
  );
  console.log(
    "vars3",
    vars3.map((i) => i.name)
  );
  console.log(
    "vars4",
    vars4.map((i) => i.name)
  );

  return {};
}

function convertToDesignTokens(
  variables: Record<string, string>
): Record<string, string> {
  // TODO

  return {};
}

async function exportDesignTokensToGithub(
  _token: string,
  _owner: string,
  _repo: string,
  _path: string,
  _designTokens: Record<string, string>
) {
  // TODO
}

// Workaround:
// - Figma Plugin does not have `btoa()` or `atob()` to convert strings to base64.
// - Figma Plugin has `base64Encode(Uint8Array): string` but we need to provide a JSON object.
// - As a workaround, we write the encoding implementation manually here.
function encode(obj: unknown) {
  const str = JSON.stringify(obj);
  let binary = "";
  for (let i = 0; i < str.length; i++) {
    binary += String.fromCharCode(str.charCodeAt(i) & 0xff);
  }
  const base64Table =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  for (let i = 0; i < binary.length; i += 3) {
    const chunk =
      (binary.charCodeAt(i) << 16) |
      (i + 1 < binary.length ? binary.charCodeAt(i + 1) << 8 : 0) |
      (i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0);
    for (let j = 0; j < 4; j++) {
      if (i * 8 + j * 6 > binary.length * 8) {
        base64 += "=";
      } else {
        base64 += base64Table.charAt((chunk >>> (6 * (3 - j))) & 0x3f);
      }
    }
  }
  return base64;
}

// =====
// Below is copy-pasted from https://github.com/figma/plugin-samples/tree/master/variables-import-export

function createCollection(name) {
  const collection = figma.variables.createVariableCollection(name);
  const modeId = collection.modes[0].modeId;
  return { collection, modeId };
}

function createToken(collection, modeId, type, name, value) {
  const token = figma.variables.createVariable(name, collection, type);
  token.setValueForMode(modeId, value);
  return token;
}

function createVariable(collection, modeId, key, valueKey, tokens) {
  const token = tokens[valueKey];
  return createToken(collection, modeId, token.resolvedType, key, {
    type: "VARIABLE_ALIAS",
    id: `${token.id}`,
  });
}

function importJSONFile({ fileName, body }) {
  const json = JSON.parse(body);
  const { collection, modeId } = createCollection(fileName);
  const aliases = {};
  const tokens = {};
  Object.entries(json).forEach(([key, object]) => {
    traverseToken({
      collection,
      modeId,
      type: json.$type,
      key,
      object,
      tokens,
      aliases,
    });
  });
  processAliases({ collection, modeId, aliases, tokens });
}

function processAliases({ collection, modeId, aliases, tokens }) {
  aliases = Object.values(aliases);
  let generations = aliases.length;
  while (aliases.length && generations > 0) {
    for (let i = 0; i < aliases.length; i++) {
      const { key, type, valueKey } = aliases[i];
      const token = tokens[valueKey];
      if (token) {
        aliases.splice(i, 1);
        tokens[key] = createVariable(collection, modeId, key, valueKey, tokens);
      }
    }
    generations--;
  }
}

function isAlias(value) {
  return value.toString().trim().charAt(0) === "{";
}

function traverseToken({
  collection,
  modeId,
  type,
  key,
  object,
  tokens,
  aliases,
}) {
  type = type || object.$type;
  // if key is a meta field, move on
  if (key.charAt(0) === "$") {
    return;
  }
  if (object.$value !== undefined) {
    if (isAlias(object.$value)) {
      const valueKey = object.$value
        .trim()
        .replace(/\./g, "/")
        .replace(/[\{\}]/g, "");
      if (tokens[valueKey]) {
        tokens[key] = createVariable(collection, modeId, key, valueKey, tokens);
      } else {
        aliases[key] = {
          key,
          type,
          valueKey,
        };
      }
    } else if (type === "color") {
      tokens[key] = createToken(
        collection,
        modeId,
        "COLOR",
        key,
        parseColor(object.$value)
      );
    } else if (type === "number") {
      tokens[key] = createToken(
        collection,
        modeId,
        "FLOAT",
        key,
        object.$value
      );
    } else {
      console.log("unsupported type", type, object);
    }
  } else {
    Object.entries(object).forEach(([key2, object2]) => {
      if (key2.charAt(0) !== "$") {
        traverseToken({
          collection,
          modeId,
          type,
          key: `${key}/${key2}`,
          object: object2,
          tokens,
          aliases,
        });
      }
    });
  }
}

async function exportToJSON() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const files = [];
  for (const collection of collections) {
    files.push(...(await processCollection(collection)));
  }
  figma.ui.postMessage({ type: "EXPORT_RESULT", files });
}

async function processCollection({ name, modes, variableIds }) {
  const files = [];
  for (const mode of modes) {
    const file = { fileName: `${name}.${mode.name}.tokens.json`, body: {} };
    for (const variableId of variableIds) {
      const { name, resolvedType, valuesByMode } =
        await figma.variables.getVariableByIdAsync(variableId);
      const value = valuesByMode[mode.modeId];
      if (value !== undefined && ["COLOR", "FLOAT"].includes(resolvedType)) {
        let obj = file.body;
        name.split("/").forEach((groupName) => {
          obj[groupName] = obj[groupName] || {};
          obj = obj[groupName];
        });
        obj.$type = resolvedType === "COLOR" ? "color" : "number";
        if (value.type === "VARIABLE_ALIAS") {
          const currentVar = await figma.variables.getVariableByIdAsync(
            value.id
          );
          obj.$value = `{${currentVar.name.replace(/\//g, ".")}}`;
        } else {
          obj.$value = resolvedType === "COLOR" ? rgbToHex(value) : value;
        }
      }
    }
    files.push(file);
  }
  return files;
}

// figma.ui.onmessage = async (e) => {
//   console.log("code received message", e);
//   if (e.type === "IMPORT") {
//     const { fileName, body } = e;
//     importJSONFile({ fileName, body });
//   } else if (e.type === "EXPORT") {
//     await exportToJSON();
//   }
// };

function rgbToHex({ r, g, b, a }) {
  if (a !== 1) {
    return `rgba(${[r, g, b]
      .map((n) => Math.round(n * 255))
      .join(", ")}, ${a.toFixed(4)})`;
  }
  const toHex = (value) => {
    const hex = Math.round(value * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  const hex = [toHex(r), toHex(g), toHex(b)].join("");
  return `#${hex}`;
}

function parseColor(color) {
  color = color.trim();
  const rgbRegex = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
  const rgbaRegex =
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)$/;
  const hslRegex = /^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/;
  const hslaRegex =
    /^hsla\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*,\s*([\d.]+)\s*\)$/;
  const hexRegex = /^#([A-Fa-f0-9]{3}){1,2}$/;
  const floatRgbRegex =
    /^\{\s*r:\s*[\d\.]+,\s*g:\s*[\d\.]+,\s*b:\s*[\d\.]+(,\s*opacity:\s*[\d\.]+)?\s*\}$/;

  if (rgbRegex.test(color)) {
    const [, r, g, b] = color.match(rgbRegex);
    return { r: parseInt(r) / 255, g: parseInt(g) / 255, b: parseInt(b) / 255 };
  } else if (rgbaRegex.test(color)) {
    const [, r, g, b, a] = color.match(rgbaRegex);
    return {
      r: parseInt(r) / 255,
      g: parseInt(g) / 255,
      b: parseInt(b) / 255,
      a: parseFloat(a),
    };
  } else if (hslRegex.test(color)) {
    const [, h, s, l] = color.match(hslRegex);
    return hslToRgbFloat(parseInt(h), parseInt(s) / 100, parseInt(l) / 100);
  } else if (hslaRegex.test(color)) {
    const [, h, s, l, a] = color.match(hslaRegex);
    return Object.assign(
      hslToRgbFloat(parseInt(h), parseInt(s) / 100, parseInt(l) / 100),
      { a: parseFloat(a) }
    );
  } else if (hexRegex.test(color)) {
    const hexValue = color.substring(1);
    const expandedHex =
      hexValue.length === 3
        ? hexValue
            .split("")
            .map((char) => char + char)
            .join("")
        : hexValue;
    return {
      r: parseInt(expandedHex.slice(0, 2), 16) / 255,
      g: parseInt(expandedHex.slice(2, 4), 16) / 255,
      b: parseInt(expandedHex.slice(4, 6), 16) / 255,
    };
  } else if (floatRgbRegex.test(color)) {
    return JSON.parse(color);
  } else {
    throw new Error("Invalid color format");
  }
}

function hslToRgbFloat(h, s, l) {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) {
    return { r: l, g: l, b: l };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, (h + 1 / 3) % 1);
  const g = hue2rgb(p, q, h % 1);
  const b = hue2rgb(p, q, (h - 1 / 3) % 1);

  return { r, g, b };
}
