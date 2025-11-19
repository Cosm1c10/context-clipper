chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-context-clipper",
    title: "Save to Context Clipper",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-to-context-clipper" && info.selectionText) {
    const text = info.selectionText;
    const url = tab.url;

    fetch("http://localhost:8000/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: text, url: url })
    })
    .then(response => response.json())
    .then(data => {
      console.log("Success:", data);
      // Optional: Notify user of success (e.g., via badge or notification if permission added)
    })
    .catch((error) => {
      console.error("Error:", error);
    });
  }
});
