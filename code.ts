// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__);

type MessageImport = {
  type: "import-to-figma";
  token: string;
  owner: string;
  repo: string;
};

type MessageExport = {
  type: "export-to-github";
  token: string;
  owner: string;
  repo: string;
  branchName: string; // TODO: for creating PR
};

// type MessageType = "import-to-figma" | "export-to-github";
type Message = MessageImport | MessageExport;

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
figma.ui.onmessage = async (msg: Message) => {
  // One way of distinguishing between different types of messages sent from
  // your HTML page is to use an object with a "type" property like this.

  console.log("onmessage", msg);

  switch (msg.type) {
    case "import-to-figma":
      importDesignTokens(msg.token, msg.owner, msg.repo);
      break;

    case "export-to-github":
      // TODO
      break;

    default:
      console.error("Unknown message type:", msg);
      break;
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  // figma.closePlugin();
};

async function importDesignTokens(token: string, owner: string, repo: string) {
  const localCollections =
    await figma.variables.getLocalVariableCollectionsAsync();

  console.log(
    "collections",
    localCollections.map((i) => i.name)
  );

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

  if (res.status !== 200) {
    const body = await res.json();
    throw { res, body };
  }

  const body = await res.json();

  console.log("body", body);

  // figma.ui.postMessage({
  //   type: msg.type,
  //   content: msg.content,
  // });
}
