// Reference
// https://github.com/figma/plugin-samples/tree/master/variables-import-export

type MessageDemo = {
  type: "IMPORT" | "EXPORT";
  fileName: string;
  body: string;
};

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
  branch: string;
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

type Message = MessageDemo | MessageTest | MessageImport | MessageExport;

// ==================================================

// Refer: https://tr.designtokens.org/format/#types

type DtColor = {
  $type: "color";
  $value: string;
};

// Todo: Enable this W3C standard and remove from DtNumber
// type DtDimension = {
//   $type: "dimension";
//   $value: {
//     value: number;
//     unit: "px" | "rem";
//   };
// };

type DtFontFamily = {
  $type: "fontFamily";
  $value: string | string[];
};

type DtFontWeight = {
  $type: "fontWeight";
  $value:
    | number
    | "thin"
    | "hairline"
    | "extra-light"
    | "ultra-light"
    | "light"
    | "normal"
    | "regular"
    | "book"
    | "medium"
    | "semi-bold"
    | "demi-bold"
    | "bold"
    | "extra-bold"
    | "ultra-bold"
    | "black"
    | "heavy"
    | "extra-black"
    | "ultra-black";
};

type DtDuration = {
  $type: "duration";
  $value: {
    value: number;
    unit: "ms" | "s";
  };
};

type DtCubicBezier = {
  $type: "cubicBezier";
  $value: number[];
};

type DtNumber = {
  $type:
    | "number"
    | "borderRadius"
    | "borderWidth"
    | "dimension"
    | "spacing"
    | "paragraphSpacing"
    | "fontSizes";
  $value: number;
};

type DtcStrokeStyle = {
  $type: "strokeStyle";
  $value:
    | "solid"
    | "dashed"
    | "dotted"
    | "double"
    | "groove"
    | "ridge"
    | "outset"
    | "inset";
};

type DtItem =
  | DtColor
  // | DtDimension
  | DtFontFamily
  | DtFontWeight
  | DtDuration
  | DtCubicBezier
  | DtNumber
  | DtcStrokeStyle;

type FigmaTokenDict = Record<string, Variable>;

type TokenAlias = {
  key: string;
  type: string;
  valueKey: string;
};
type TokenAliasDict = Record<string, TokenAlias>;

type DtObject =
  | {
      [x: string]: DtObject;
    }
  | DtItem;

// ==================================================

console.clear();

// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
// figma.showUI(__html__, {
//   width: 400,
//   height: 200,
// });
switch (figma.command) {
  case "import":
    figma.showUI(__uiFiles__["import"], {
      width: 500,
      height: 500,
    });
    break;

  case "export":
    figma.showUI(__uiFiles__["export"], {
      width: 500,
      height: 500,
      themeColors: true,
    });
    break;

  default:
    figma.showUI(__uiFiles__["ui"], {
      width: 400,
      height: 300,
    });
    break;
}

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
figma.ui.onmessage = async (msg: Message) => {
  // One way of distinguishing between different types of messages sent from
  // your HTML page is to use an object with a "type" property like this.

  switch (msg.type) {
    case "test":
      // use for testing
      break;

    case "import-to-figma":
      {
        const designTokens = await fetchDesignTokensFromRepo(
          msg.token,
          msg.owner,
          msg.repo,
          msg.branch,
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

        const designTokens = await convertToDesignTokens(variables);

        await pushToBranch(
          msg.token,
          msg.owner,
          msg.repo,
          msg.branch,
          msg.path,
          designTokens
        );

        await createPullRequest(msg.token, msg.owner, msg.repo, msg.branch);

        figma.ui.postMessage({
          type: "export-to-github",
        });
      }
      break;

    // case "IMPORT":
    //   {
    //     importJSONFile(msg.fileName, msg.body);
    //   }
    //   break;

    // case "EXPORT":
    //   {
    //     await exportToJSON();
    //   }
    //   break;

    default:
      console.error("Unknown message type:", msg);
      break;
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  // figma.closePlugin();
};

// ================================================== Import

async function fetchDesignTokensFromRepo(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  path: string
): Promise<DtObject> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`,
    {
      method: "GET",
      cache: "no-cache",
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

  console.log("Fetched from Github", result);

  return result;
}

async function applyDesignTokensToFigma(json: DtObject): Promise<void> {
  console.log("applyDesignTokensToFigma", json);

  const existingCollections = await getVariablesFromFigma();

  console.log("current collection:", existingCollections);

  // TODO
  // - for each collection in JSON:
  //  - delete collection
  //  - recreate collection
  // - note: this should behave like upsert. does not delete other collections.

  const githubCollections = Object.entries(json);

  console.log("from github:", githubCollections);

  for (let i = 0; i < githubCollections.length; i++) {
    const [collectionName, content] = githubCollections[i];

    if (collectionName.startsWith("$")) {
      console.log("skip:", collectionName);
      continue;
    }

    console.log("=== COLLECTION:", collectionName);

    // If collection already exists locally, delete it
    const existing = existingCollections.find((c) => c.name === collectionName);
    if (existing) {
      console.log("found, delete:", existing?.name);
      existing.remove();
    } else {
      console.log("new:", collectionName);
    }

    // Create new collection
    const { collection, modeId } = createCollection(collectionName);
    const aliases: TokenAliasDict = {};
    const tokens: FigmaTokenDict = {};

    Object.entries(content as object).forEach(([key, object]) => {
      console.log("### top entry:", key, object);
      traverseToken(collection, modeId, key, object, tokens, aliases);
    });

    processAliases(collection, modeId, aliases, tokens);
    console.log("###done aliases:", aliases);
    console.log("###done tokens:", tokens);
  }
}

// ================================================== Export

async function getVariablesFromFigma(): Promise<VariableCollection[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  for (const collection of collections) {
    if (collection.modes.length > 1) {
      const name = collection.name;
      figma.ui.postMessage({
        type: "log",
        message: `Collection "${name}" has more than one mode. Design Tokens currently does not support modes. Please split the modes into separate collections instead and try again.`,
      });
    }
  }

  return collections;
}

async function convertToDesignTokens(
  collections: VariableCollection[]
): Promise<Record<string, string>> {
  let files = {};
  for (const collection of collections) {
    const tokenObj = await convertToDesignToken(collection);
    files = {
      ...files,
      ...tokenObj,
    };
  }
  return files;
}

async function convertToDesignToken(collection: VariableCollection) {
  const { name: collectionName, modes, variableIds } = collection;

  console.log("converting:", collectionName);

  // Note: Design Token W3C does not support modes yet, so we assume is always length === 1
  const mode = modes[0];

  const body: Record<string, unknown> = {};

  for (const variableId of variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) {
      continue;
    }

    const { name, resolvedType, valuesByMode } = variable;
    const value = valuesByMode[mode.modeId];

    // console.log("==>", name, resolvedType, value);

    if (
      value !== undefined &&
      ["COLOR", "FLOAT", "STRING"].includes(resolvedType)
    ) {
      let obj = body;

      // Traverse to the last leaf in the path
      name.split("/").forEach((groupName) => {
        obj[groupName] = obj[groupName] || {};
        obj = obj[groupName] as Record<string, unknown>;
      });

      // Notes:
      // - W3C Design Tokens have strict types, but Figma only has string/float/color types.
      // - For now, we follow Figma types and store them in W3C JSON format, but using custom $type.

      if (isVariableAlias(value)) {
        const currentVar = await figma.variables.getVariableByIdAsync(value.id);
        if (!currentVar) {
          continue;
        }

        const parentCollection =
          await figma.variables.getVariableCollectionByIdAsync(
            currentVar.variableCollectionId
          );

        const aliasParentCollectionName = parentCollection?.name
          ? `${parentCollection?.name}.`
          : "";

        obj.$type = isColor(value, currentVar.resolvedType || "STRING")
          ? "color"
          : isNumber(value, currentVar.resolvedType || "STRING")
          ? "number"
          : "string";

        obj.$value = `{${aliasParentCollectionName}${currentVar.name.replace(
          /\//g,
          "."
        )}}`;
      } else {
        if (isColor(value, resolvedType)) {
          obj.$type = "color";
          obj.$value = rgbToHex(value);
        } else if (isNumber(value, resolvedType)) {
          obj.$type = "number";
          obj.$value = value;
        } else {
          obj.$type = "string";
          obj.$value = value;
        }
      }
    }
  }

  console.log("DONE", body);

  return {
    [collectionName]: body,
  };
}

async function pushToBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  designTokenPath: string,
  content: Record<string, unknown>
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
          content: encode(content),
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

function isColor(
  x: unknown,
  resolvedType: VariableResolvedDataType
): x is RGBA {
  return resolvedType === "COLOR";
}

function isNumber(
  x: unknown,
  resolvedType: VariableResolvedDataType
): x is number {
  return resolvedType === "FLOAT";
}

function isVariableAlias(x: unknown): x is VariableAlias {
  return (x as VariableAlias).type === "VARIABLE_ALIAS";
}

// Workaround:
// - Figma Plugin does not have `btoa()` or `atob()` to convert strings to base64.
// - Figma Plugin has `base64Encode(Uint8Array): string` but we need to provide a JSON object.
// - As a workaround, we write the encoding implementation manually here.
function encode(obj: unknown) {
  const str = JSON.stringify(obj, null, 2);
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

function rgbToHex({ r, g, b, a }: RGBA) {
  if (a !== 1) {
    return `rgba(${[r, g, b]
      .map((n) => Math.round(n * 255))
      .join(", ")}, ${a.toFixed(4)})`;
  }
  const toHex = (value: number) => {
    const hex = Math.round(value * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  const hex = [toHex(r), toHex(g), toHex(b)].join("");
  return `#${hex}`;
}

// ================================================== Import

function createCollection(name: string) {
  const collection = figma.variables.createVariableCollection(name);
  const modeId = collection.modes[0].modeId;
  return { collection, modeId };
}

function isItem(x: unknown): x is DtItem {
  return !!(x as DtItem).$type;
}

function isAlias(value: string) {
  return value.toString().trim().charAt(0) === "{";
}

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function traverseToken(
  collection: VariableCollection,
  modeId: string,
  key: string,
  object: DtObject,
  tokens: FigmaTokenDict,
  aliases: TokenAliasDict
) {
  // if key is a meta field, move on
  if (key.charAt(0) === "$") {
    return;
  }

  // If this is a token, then read the type and value.
  // else this is a nested object, traverse into it.
  if (isItem(object) && object.$value !== undefined) {
    const type = object.$type;

    if (isString(object.$value) && isAlias(object.$value)) {
      // Handle aliases
      const valueKey = object.$value
        .trim()
        .replace(/\./g, "/")
        .replace(/[{}]/g, "");

      if (tokens[valueKey]) {
        // console.log("=== var:", object);
        tokens[key] = createVariable(collection, modeId, key, valueKey, tokens);
      } else {
        // console.log("add alias to dict:", key, type, valueKey);
        const keyWithParent = `${collection.name}/${key}`;
        // const keyWithParent = key;
        aliases[keyWithParent] = {
          key,
          type,
          valueKey,
        };
      }
    } else {
      // Handle tokens
      // console.log("proc:", object.$type);
      switch (object.$type) {
        case "color":
          tokens[key] = createToken(
            collection,
            modeId,
            "COLOR",
            key,
            parseColor(object.$value)
          );
          break;

        case "number":
        case "borderRadius":
        case "borderWidth":
        case "dimension":
        case "spacing":
        case "paragraphSpacing":
        case "fontSizes":
          // console.log("====CREATE:", key, object);
          tokens[key] = createToken(
            collection,
            modeId,
            "FLOAT",
            key,
            Number(object.$value)
          );
          break;

        default:
          if (isString(object.$value)) {
            tokens[key] = createToken(
              collection,
              modeId,
              "STRING",
              key,
              object.$value
            );
          } else {
            console.warn("Unhandled type", object);
          }
          break;
      }
    }
  } else {
    Object.entries(object as object).forEach(([key2, object2]) => {
      // Only traverse if key is not a meta field like "$theme"
      if (key2.charAt(0) !== "$") {
        traverseToken(
          collection,
          modeId,
          `${key}/${key2}`,
          object2,
          tokens,
          aliases
        );
      }
    });
  }
}

function processAliases(
  collection: VariableCollection,
  modeId: string,
  tokenAliases: TokenAliasDict,
  tokens: FigmaTokenDict
) {
  const aliases = Object.values(tokenAliases);

  for (let i = 0; i < aliases.length; i++) {
    const { key, valueKey } = aliases[i];
    const token = tokens[valueKey];
    console.log("### token", token);
    if (token) {
      aliases.splice(i, 1);
      tokens[key] = createVariable(collection, modeId, key, valueKey, tokens);
    } else {
      tokens[key] = createToken(collection, modeId, "STRING", key, valueKey);
    }
  }
}

function createToken(
  collection: VariableCollection,
  modeId: string,
  resolvedType: VariableResolvedDataType,
  name: string,
  value: VariableValue
) {
  try {
    const token = figma.variables.createVariable(
      name,
      collection,
      resolvedType
    );
    token.setValueForMode(modeId, value);
    return token;
  } catch (err) {
    console.error(`createToken: ${collection.name}, ${name}, ${value}`);
    throw err;
  }
}

function createVariable(
  collection: VariableCollection,
  modeId: string,
  key: string,
  valueKey: string,
  tokens: FigmaTokenDict
) {
  const token = tokens[valueKey];

  return createToken(collection, modeId, token.resolvedType, key, {
    type: "VARIABLE_ALIAS",
    id: `${token.id}`,
  });
}

function parseColor(color: string): RGB | RGBA {
  color = color.trim();
  const rgbRegex = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
  const rgbaRegex =
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)$/;
  const hslRegex = /^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/;
  const hslaRegex =
    /^hsla\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*,\s*([\d.]+)\s*\)$/;
  const hexRegex = /^#([A-Fa-f0-9]{3}){1,2}$/;
  const floatRgbRegex =
    /^\{\s*r:\s*[\d.]+,\s*g:\s*[\d.]+,\s*b:\s*[\d.]+(,\s*opacity:\s*[\d.]+)?\s*\}$/;

  type regexRGBA = string[];

  if (rgbRegex.test(color)) {
    const [, r, g, b] = color.match(rgbRegex) as regexRGBA;
    return { r: parseInt(r) / 255, g: parseInt(g) / 255, b: parseInt(b) / 255 };
  } else if (rgbaRegex.test(color)) {
    const [, r, g, b, a] = color.match(rgbaRegex) as regexRGBA;
    return {
      r: parseInt(r) / 255,
      g: parseInt(g) / 255,
      b: parseInt(b) / 255,
      a: parseFloat(a),
    };
  } else if (hslRegex.test(color)) {
    const [, h, s, l] = color.match(hslRegex) as regexRGBA;
    return hslToRgbFloat(parseInt(h), parseInt(s) / 100, parseInt(l) / 100);
  } else if (hslaRegex.test(color)) {
    const [, h, s, l, a] = color.match(hslaRegex) as regexRGBA;
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
    console.warn(`Unhandled color format: ${color}`);
    return { r: 0, g: 0, b: 0 };
  }
}

function hslToRgbFloat(h: number, s: number, l: number) {
  const hue2rgb = (p: number, q: number, t: number) => {
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
